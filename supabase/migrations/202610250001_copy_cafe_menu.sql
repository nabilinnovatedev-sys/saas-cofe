-- Create a cafe and optionally copy an existing catalogue in one transaction.
-- Images are reused by path; catalogue rows and future edits are independent.
create or replace function public.admin_create_cafe(
  p_name text,
  p_slug text,
  p_currency text default 'MAD',
  p_timezone text default 'Africa/Casablanca',
  p_source_cafe_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cafe_id uuid;
  v_source public.cafes;
  v_categories integer := 0;
  v_products integer := 0;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_source_cafe_id is not null then
    select * into v_source from public.cafes where id = p_source_cafe_id;
    if not found then raise exception 'SOURCE_CAFE_NOT_FOUND'; end if;
    if v_source.currency::text is distinct from p_currency then
      raise exception 'SOURCE_CURRENCY_MISMATCH';
    end if;
    if not exists(select 1 from public.products where cafe_id = p_source_cafe_id) then
      raise exception 'SOURCE_MENU_EMPTY';
    end if;
  end if;

  insert into public.cafes(name, slug, currency, timezone)
  values (trim(p_name), p_slug, p_currency, p_timezone)
  returning id into v_cafe_id;

  if p_source_cafe_id is not null then
    with category_map as materialized (
      select id as source_id, gen_random_uuid() as new_id,
             name, sort_order, active, image_path
      from public.menu_categories where cafe_id = p_source_cafe_id
    ), copied_categories as (
      insert into public.menu_categories(id, cafe_id, name, sort_order, active, image_path)
      select new_id, v_cafe_id, name, sort_order, active, image_path from category_map
      returning id
    ), copied_products as (
      insert into public.products(
        cafe_id, category_id, name, description, price_minor,
        photo_path, available, active, sort_order
      )
      select v_cafe_id, m.new_id, p.name, p.description, p.price_minor,
             p.photo_path, p.available, p.active, p.sort_order
      from public.products p
      join category_map m on m.source_id = p.category_id
      join copied_categories c on c.id = m.new_id
      where p.cafe_id = p_source_cafe_id
      returning id
    )
    select (select count(*) from copied_categories), (select count(*) from copied_products)
    into v_categories, v_products;
    if v_products = 0 then raise exception 'SOURCE_MENU_EMPTY'; end if;
  end if;

  insert into public.audit_events(cafe_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_cafe_id, auth.uid(), 'cafe.created', 'cafe', v_cafe_id::text,
          jsonb_build_object('source_cafe_id', p_source_cafe_id,
                             'categories_copied', v_categories, 'products_copied', v_products));
  return jsonb_build_object('id', v_cafe_id, 'categories_copied', v_categories, 'products_copied', v_products);
end $$;

revoke all on function public.admin_create_cafe(text,text,text,text,uuid) from public, anon;
grant execute on function public.admin_create_cafe(text,text,text,text,uuid) to authenticated;
