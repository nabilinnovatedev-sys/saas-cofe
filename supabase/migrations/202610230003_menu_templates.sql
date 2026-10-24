-- Keep the selected template in the draft and in each immutable publication.
alter table public.cafe_branding
  add column if not exists template_id text not null default 'cafe'
    check (template_id in ('grill', 'cafe', 'garden'));

create or replace function public.snapshot_menu_template()
returns trigger language plpgsql set search_path = '' as $$
declare v_template text;
begin
  select template_id into v_template
  from public.cafe_branding where cafe_id = new.cafe_id;
  new.snapshot := jsonb_set(new.snapshot, '{cafe,template_id}', to_jsonb(coalesce(v_template, 'cafe')));
  return new;
end;
$$;
revoke all on function public.snapshot_menu_template() from public;
drop trigger if exists publication_menu_template on public.publication_versions;
create trigger publication_menu_template
  before insert on public.publication_versions
  for each row execute function public.snapshot_menu_template();

notify pgrst, 'reload schema';
