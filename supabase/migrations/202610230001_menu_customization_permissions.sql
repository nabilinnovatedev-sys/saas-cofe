alter table public.cafe_branding
  add column if not exists hero_background_type text not null default 'color',
  add column if not exists hero_background_color char(7) not null default '#F3E7D7',
  add column if not exists hero_background_path text,
  add column if not exists logo_position text not null default 'overlap';

alter table public.menu_categories
  add column if not exists image_path text;

alter table public.staff_profiles
  add column if not exists can_manage_categories boolean not null default false,
  add column if not exists can_manage_products boolean not null default false;

alter table public.cafe_branding
  add constraint cafe_branding_background_type_check
    check (hero_background_type in ('color', 'image')),
  add constraint cafe_branding_background_color_check
    check (hero_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint cafe_branding_logo_position_check
    check (logo_position in ('top', 'center', 'overlap'));

create or replace function public.can_manage_categories(p_cafe_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_admin() or exists(
    select 1 from public.staff_profiles
    where user_id=auth.uid() and cafe_id=p_cafe_id and role='waiter'
      and active and can_manage_categories
  )
$$;

create or replace function public.can_manage_products(p_cafe_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_admin() or exists(
    select 1 from public.staff_profiles
    where user_id=auth.uid() and cafe_id=p_cafe_id and role='waiter'
      and active and can_manage_products
  )
$$;

revoke all on function public.can_manage_categories(uuid) from public;
revoke all on function public.can_manage_products(uuid) from public;
grant execute on function public.can_manage_categories(uuid) to authenticated;
grant execute on function public.can_manage_products(uuid) to authenticated;

create policy waiter_categories_read on public.menu_categories for select to authenticated
  using(cafe_id=public.current_waiter_cafe());
create policy permitted_categories_insert on public.menu_categories for insert to authenticated
  with check(public.can_manage_categories(cafe_id));
create policy permitted_categories_update on public.menu_categories for update to authenticated
  using(public.can_manage_categories(cafe_id)) with check(public.can_manage_categories(cafe_id));
create policy permitted_categories_delete on public.menu_categories for delete to authenticated
  using(public.can_manage_categories(cafe_id));

create policy waiter_products_read on public.products for select to authenticated
  using(cafe_id=public.current_waiter_cafe());
create policy permitted_products_insert on public.products for insert to authenticated
  with check(public.can_manage_products(cafe_id));
create policy permitted_products_update on public.products for update to authenticated
  using(public.can_manage_products(cafe_id)) with check(public.can_manage_products(cafe_id));
create policy permitted_products_delete on public.products for delete to authenticated
  using(public.can_manage_products(cafe_id));

create policy permitted_catalog_images_insert on storage.objects for insert to authenticated
  with check(
    bucket_id='product-images'
    and (storage.foldername(name))[1]=public.current_waiter_cafe()::text
    and (
      public.can_manage_categories(public.current_waiter_cafe())
      or public.can_manage_products(public.current_waiter_cafe())
    )
  );
create policy permitted_catalog_images_update on storage.objects for update to authenticated
  using(
    bucket_id='product-images'
    and (storage.foldername(name))[1]=public.current_waiter_cafe()::text
    and (
      public.can_manage_categories(public.current_waiter_cafe())
      or public.can_manage_products(public.current_waiter_cafe())
    )
  );

create or replace function public.admin_publish_cafe(p_cafe_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_version int;v_snapshot jsonb;v_id uuid;
begin
 if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if not exists(select 1 from public.cafe_branding where cafe_id=p_cafe_id) then raise exception 'BRANDING_REQUIRED';end if;
 if not exists(select 1 from public.products where cafe_id=p_cafe_id and active) then raise exception 'PRODUCT_REQUIRED';end if;
 select coalesce(max(version_no),0)+1 into v_version from public.publication_versions where cafe_id=p_cafe_id;
 select jsonb_build_object(
  'cafe',jsonb_build_object(
    'id',c.id,'name',c.name,'slug',c.slug,'currency',c.currency,
    'description',b.description,'primary_color',b.primary_color,
    'secondary_color',b.secondary_color,'accent_color',b.accent_color,
    'logo_url',b.logo_path,'contact_phone',c.contact_phone,
    'contact_address',c.contact_address,
    'hero_background_type',b.hero_background_type,
    'hero_background_color',b.hero_background_color,
    'hero_background_url',b.hero_background_path,
    'logo_position',b.logo_position
  ),
  'categories',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',mc.id,'name',mc.name,'sort_order',mc.sort_order,
      'image_url',mc.image_path,
      'products',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,'category_id',p.category_id,'name',p.name,
          'description',p.description,'price_minor',p.price_minor,
          'photo_url',p.photo_path,'available',p.available,
          'sort_order',p.sort_order
        ) order by p.sort_order)
        from public.products p where p.category_id=mc.id and p.active
      ),'[]'::jsonb)
    ) order by mc.sort_order)
    from public.menu_categories mc where mc.cafe_id=c.id and mc.active
  ),'[]'::jsonb)
 ) into v_snapshot
 from public.cafes c join public.cafe_branding b on b.cafe_id=c.id
 where c.id=p_cafe_id;
 insert into public.publication_versions(cafe_id,version_no,snapshot,published_by)
 values(p_cafe_id,v_version,v_snapshot,auth.uid()) returning id into v_id;
 update public.cafes set published_version_id=v_id,status=case when status='draft' then 'active' else status end where id=p_cafe_id;
 insert into public.audit_events(cafe_id,actor_user_id,action,target_type,target_id,metadata)
 values(p_cafe_id,auth.uid(),'cafe.published','publication',v_id::text,jsonb_build_object('version',v_version));
 return jsonb_build_object('id',v_id,'version_no',v_version);
end $$;

