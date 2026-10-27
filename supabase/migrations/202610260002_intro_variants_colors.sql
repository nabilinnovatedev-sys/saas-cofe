-- Extend the previous intro feature without modifying already published snapshots.
begin;
alter table public.cafe_branding
  drop constraint cafe_branding_intro_style_check,
  add constraint cafe_branding_intro_style_check
    check (intro_style in ('none', 'fade', 'pulse', 'curtain', 'card', 'rings')),
  add column intro_background_color text check (intro_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column intro_text_color text check (intro_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column intro_accent_color text check (intro_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column intro_surface_color text check (intro_surface_color ~ '^#[0-9A-Fa-f]{6}$');

create or replace function public.snapshot_menu_template()
returns trigger language plpgsql set search_path = '' as $$
declare v_brand public.cafe_branding%rowtype;
begin
  select * into v_brand from public.cafe_branding where cafe_id = new.cafe_id;
  new.snapshot := jsonb_set(new.snapshot, '{cafe}', (new.snapshot->'cafe') || jsonb_build_object(
    'template_id', coalesce(v_brand.template_id, 'cafe'),
    'menu_background_color', v_brand.menu_background_color,
    'menu_background_end', v_brand.menu_background_end,
    'menu_animation', coalesce(v_brand.menu_animation, 'none'),
    'intro_style', coalesce(v_brand.intro_style, 'none'),
    'intro_duration_ms', coalesce(v_brand.intro_duration_ms, 1800),
    'intro_background_color', v_brand.intro_background_color,
    'intro_text_color', v_brand.intro_text_color,
    'intro_accent_color', v_brand.intro_accent_color,
    'intro_surface_color', v_brand.intro_surface_color
  ));
  return new;
end;
$$;
revoke all on function public.snapshot_menu_template() from public;
notify pgrst, 'reload schema';
commit;
