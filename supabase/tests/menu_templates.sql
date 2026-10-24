-- Run as postgres on an initialized project. All fixtures are rolled back.
begin;
do $$
declare
  v_admin uuid;
  v_cafe uuid := gen_random_uuid();
  v_category uuid := gen_random_uuid();
  v_first uuid;
  v_second uuid;
  v_slug text := 'template-check-' || v_cafe::text;
  v_value text;
begin
  select user_id into v_admin from public.staff_profiles
  where role = 'platform_admin' and active limit 1;
  if v_admin is null then raise exception 'Test requires an existing active administrator'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.cafes(id, name, slug) values(v_cafe, 'Template verification', v_slug);
  insert into public.cafe_branding(cafe_id, template_id) values(v_cafe, 'grill');
  insert into public.menu_categories(id, cafe_id, name) values(v_category, v_cafe, 'Test category');
  insert into public.products(cafe_id, category_id, name, price_minor) values(v_cafe, v_category, 'Test product', 100);
  v_first := (public.admin_publish_cafe(v_cafe)->>'id')::uuid;
  select snapshot #>> '{cafe,template_id}' into v_value from public.publication_versions where id = v_first;
  if v_value is distinct from 'grill' then raise exception 'Published template missing: %', v_value; end if;
  update public.cafe_branding set template_id = 'garden' where cafe_id = v_cafe;
  v_value := public.public_get_menu(v_slug, null) #>> '{cafe,template_id}';
  if v_value is distinct from 'grill' then raise exception 'Draft change leaked into public menu: %', v_value; end if;
  v_second := (public.admin_publish_cafe(v_cafe)->>'id')::uuid;
  v_value := public.public_get_menu(v_slug, null) #>> '{cafe,template_id}';
  if v_value is distinct from 'garden' then raise exception 'Republished template missing: %', v_value; end if;
  select snapshot #>> '{cafe,template_id}' into v_value from public.publication_versions where id = v_first;
  if v_value is distinct from 'grill' then raise exception 'Historical publication changed'; end if;
end $$;
rollback;
select 'PASS: template publication, draft isolation, republish, history preservation' as result;
