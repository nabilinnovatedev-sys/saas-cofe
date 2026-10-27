-- Run on an initialized project as postgres. Nothing is retained.
begin;
do $$
declare
  v_admin uuid;
  v_cafe uuid := gen_random_uuid();
  v_category uuid := gen_random_uuid();
  v_first uuid;
  v_slug text := 'effects-check-' || v_cafe::text;
  v_snapshot jsonb;
  v_style text;
begin
  select user_id into v_admin from public.staff_profiles where role = 'platform_admin' and active limit 1;
  if v_admin is null then raise exception 'Test requires an active administrator'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.cafes(id, name, slug) values(v_cafe, 'Effects verification', v_slug);
  insert into public.cafe_branding(cafe_id, template_id, menu_background_color, menu_background_end, menu_animation, intro_style, intro_duration_ms)
    values(v_cafe, 'garden', '#123456', '#abcdef', 'rise', 'pulse', 2500);
  insert into public.menu_categories(id, cafe_id, name) values(v_category, v_cafe, 'Category');
  insert into public.products(cafe_id, category_id, name, price_minor) values(v_cafe, v_category, 'Product', 100);
  v_first := (public.admin_publish_cafe(v_cafe)->>'id')::uuid;
  select snapshot->'cafe' into v_snapshot from public.publication_versions where id = v_first;
  if not v_snapshot @> '{"template_id":"garden","menu_background_color":"#123456","menu_background_end":"#abcdef","menu_animation":"rise","intro_style":"pulse","intro_duration_ms":2500}'::jsonb then
    raise exception 'Effects missing from publication: %', v_snapshot;
  end if;
  update public.cafe_branding set intro_style = 'none', menu_background_color = '#FFFFFF' where cafe_id = v_cafe;
  if public.public_get_menu(v_slug, null) #>> '{cafe,intro_style}' is distinct from 'pulse' then raise exception 'Draft leaked'; end if;
  perform public.admin_publish_cafe(v_cafe);
  if public.public_get_menu(v_slug, null) #>> '{cafe,intro_style}' is distinct from 'none' then raise exception 'Republish failed'; end if;
  if (select snapshot #>> '{cafe,intro_style}' from public.publication_versions where id = v_first) is distinct from 'pulse' then raise exception 'History changed'; end if;
  foreach v_style in array array['card', 'rings'] loop
    update public.cafe_branding set intro_style = v_style, intro_background_color = '#123456',
      intro_text_color = '#fedcba', intro_accent_color = '#aabbcc', intro_surface_color = '#221100'
      where cafe_id = v_cafe;
    perform public.admin_publish_cafe(v_cafe);
    v_snapshot := public.public_get_menu(v_slug, null)->'cafe';
    if v_snapshot->>'intro_style' is distinct from v_style or not v_snapshot @>
      '{"intro_background_color":"#123456","intro_text_color":"#fedcba","intro_accent_color":"#aabbcc","intro_surface_color":"#221100"}'::jsonb then
      raise exception 'Intro colors or variant missing: %', v_snapshot;
    end if;
  end loop;
  begin
    update public.cafe_branding set intro_background_color = 'url(x)' where cafe_id = v_cafe;
    raise exception 'Invalid color accepted';
  exception when check_violation then null;
  end;
  begin
    update public.cafe_branding set intro_duration_ms = 99999 where cafe_id = v_cafe;
    raise exception 'Duration accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;
