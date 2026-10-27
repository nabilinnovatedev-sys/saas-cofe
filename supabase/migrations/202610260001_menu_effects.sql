-- Optional effects preserve existing menus until explicitly enabled.
alter table public.cafe_branding
  add column menu_background_color text check (menu_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column menu_background_end text check (menu_background_end ~ '^#[0-9A-Fa-f]{6}$'),
  add column menu_animation text not null default 'none' check (menu_animation in ('none', 'fade', 'rise', 'zoom')),
  add column intro_style text not null default 'none' check (intro_style in ('none', 'fade', 'pulse', 'curtain')),
  add column intro_duration_ms integer not null default 1800 check (intro_duration_ms between 1000 and 4000);

-- Extend the existing publication trigger, keeping immutable public snapshots.
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
    'intro_duration_ms', coalesce(v_brand.intro_duration_ms, 1800)
  ));
  return new;
end;
$$;
revoke all on function public.snapshot_menu_template() from public;
notify pgrst, 'reload schema';
