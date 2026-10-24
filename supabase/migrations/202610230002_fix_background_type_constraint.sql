alter table public.cafe_branding
  drop constraint if exists cafe_branding_background_type_check;

update public.cafe_branding
set hero_background_type = 'image'
where hero_background_type = 'imag e';

alter table public.cafe_branding
  add constraint cafe_branding_background_type_check
  check (hero_background_type in ('color', 'image'));

notify pgrst, 'reload schema';
