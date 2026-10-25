-- Run after migrations, as postgres. No fixture is retained.
begin;
do $$
declare
  v_admin uuid;
  v_source uuid := gen_random_uuid();
  v_empty uuid := gen_random_uuid();
  v_category uuid := gen_random_uuid();
  v_hidden_category uuid := gen_random_uuid();
  v_target uuid;
  v_blank uuid;
  v_result jsonb;
  v_slug text := 'copy-check-' || gen_random_uuid()::text;
  v_count integer;
  v_before jsonb;
begin
  select user_id into v_admin from public.staff_profiles
  where role = 'platform_admin' and active limit 1;
  if v_admin is null then raise exception 'Test requires an active administrator'; end if;
  if has_function_privilege('anon', 'public.admin_create_cafe(text,text,text,text,uuid)', 'execute') then
    raise exception 'Anonymous execution must be denied';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_create_cafe(text,text,text,text,uuid)', 'execute') then
    raise exception 'Authenticated users need execute permission (role checked inside RPC)';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.cafes(id, name, slug) values
    (v_source, 'Source fixture', v_slug || '-source'), (v_empty, 'Empty fixture', v_slug || '-empty');
  insert into public.menu_categories(id, cafe_id, name, sort_order, active, image_path) values
    (v_category, v_source, 'Boissons', 4, true, 'fixture/category.jpg'),
    (v_hidden_category, v_source, 'Masquée', 9, false, null);
  insert into public.products(cafe_id, category_id, name, description, price_minor, photo_path, sort_order, available, active) values
    (v_source, v_category, 'Café', 'Description originale', 1500, 'fixture/product.jpg', 7, true, true),
    (v_source, v_category, 'Jus indisponible', null, 2000, null, 8, false, true),
    (v_source, v_hidden_category, 'Produit masqué', null, 1000, null, 2, true, false);
  select jsonb_agg(to_jsonb(p) order by p.id) into v_before from public.products p where cafe_id = v_source;

  -- A non-admin authenticated identity must not bypass RLS through the definer RPC.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.admin_create_cafe('Forbidden', v_slug || '-forbidden', 'MAD', 'Africa/Casablanca', v_source);
    raise exception 'Non-admin creation succeeded';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  begin
    perform public.admin_create_cafe('Missing source', v_slug || '-missing', 'MAD', 'Africa/Casablanca', gen_random_uuid());
    raise exception 'Missing source accepted';
  exception when raise_exception then
    if sqlerrm <> 'SOURCE_CAFE_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.admin_create_cafe('Empty source', v_slug || '-no-products', 'MAD', 'Africa/Casablanca', v_empty);
    raise exception 'Empty source accepted';
  exception when raise_exception then
    if sqlerrm <> 'SOURCE_MENU_EMPTY' then raise; end if;
  end;
  begin
    perform public.admin_create_cafe('Wrong currency', v_slug || '-currency', 'EUR', 'Africa/Casablanca', v_source);
    raise exception 'Currency mismatch accepted';
  exception when raise_exception then
    if sqlerrm <> 'SOURCE_CURRENCY_MISMATCH' then raise; end if;
  end;
  if exists(select 1 from public.cafes where slug::text in
    (v_slug || '-forbidden', v_slug || '-missing', v_slug || '-no-products', v_slug || '-currency')) then
    raise exception 'Failed request left a cafe behind';
  end if;

  v_result := public.admin_create_cafe('Independent copy', v_slug, 'MAD', 'Africa/Casablanca', v_source);
  v_target := (v_result->>'id')::uuid;
  if (v_result->>'categories_copied')::int <> 2 or (v_result->>'products_copied')::int <> 3 then
    raise exception 'Wrong copy counts: %', v_result;
  end if;
  if not exists(select 1 from public.cafes where id = v_target and status = 'draft' and published_version_id is null) then
    raise exception 'New cafe must remain unpublished';
  end if;
  if exists(select 1 from public.cafe_tables where cafe_id = v_target)
     or exists(select 1 from public.staff_profiles where cafe_id = v_target)
     or exists(select 1 from public.orders where cafe_id = v_target)
     or exists(select 1 from public.cafe_branding where cafe_id = v_target) then
    raise exception 'Only the catalogue should be copied';
  end if;
  if exists(
    select 1 from public.menu_categories s
    left join public.menu_categories t on t.cafe_id = v_target and t.name = s.name
    where s.cafe_id = v_source and (t.id is null or t.id = s.id or
      row(s.name,s.sort_order,s.active,s.image_path) is distinct from row(t.name,t.sort_order,t.active,t.image_path))
  ) then raise exception 'Category fields were not preserved'; end if;
  if exists(
    select 1 from public.products s
    join public.menu_categories sc on sc.id = s.category_id
    left join public.products t on t.cafe_id = v_target and t.name = s.name
    left join public.menu_categories tc on tc.id = t.category_id and tc.cafe_id = v_target
    where s.cafe_id = v_source and (t.id is null or t.id = s.id or tc.id is null or tc.id = sc.id or
      row(s.name,s.description,s.price_minor,s.photo_path,s.sort_order,s.available,s.active,sc.name)
      is distinct from row(t.name,t.description,t.price_minor,t.photo_path,t.sort_order,t.available,t.active,tc.name))
  ) then raise exception 'Products or tenant mapping were not preserved'; end if;

  -- Retry with the same public address must not duplicate catalogue rows.
  begin
    perform public.admin_create_cafe('Duplicate', v_slug, 'MAD', 'Africa/Casablanca', v_source);
    raise exception 'Duplicate slug accepted';
  exception when unique_violation then null;
  end;
  select count(*) into v_count from public.products where cafe_id = v_target;
  if v_count <> 3 then raise exception 'Retry duplicated products'; end if;
  update public.products set price_minor = 9999, photo_path = 'copy/new-image.jpg' where cafe_id = v_target;
  update public.menu_categories set name = 'Copie modifiée' where cafe_id = v_target and name = 'Boissons';
  if (select jsonb_agg(to_jsonb(p) order by p.id) from public.products p where cafe_id = v_source) is distinct from v_before then
    raise exception 'Source products were modified';
  end if;
  if not exists(select 1 from public.menu_categories where id = v_category and name = 'Boissons') then
    raise exception 'Source category was modified';
  end if;
  if not exists(select 1 from public.audit_events where cafe_id = v_target and action = 'cafe.created'
                and metadata->>'source_cafe_id' = v_source::text) then
    raise exception 'Missing audit event';
  end if;
  v_blank := (public.admin_create_cafe('Blank cafe', v_slug || '-blank')->>'id')::uuid;
  if exists(select 1 from public.products where cafe_id = v_blank)
     or exists(select 1 from public.menu_categories where cafe_id = v_blank) then
    raise exception 'Blank creation unexpectedly copied a menu';
  end if;
end $$;
rollback;
select 'PASS: copy fields, independent IDs/edits, draft state, permissions, currency, empty/missing sources, atomic failure, duplicate prevention, blank creation' as result;
