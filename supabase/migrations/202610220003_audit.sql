create or replace function public.audit_cafe_status_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from new.status then
  insert into public.audit_events(cafe_id,actor_user_id,action,target_type,target_id,metadata)
  values(new.id,auth.uid(),case when new.status='suspended' then 'cafe.suspended' else 'cafe.status_changed' end,'cafe',new.id::text,jsonb_build_object('from',old.status,'to',new.status,'reason',new.suspension_reason));
 end if;
 return new;
end $$;
create trigger cafes_audit_status after update of status on public.cafes for each row execute function public.audit_cafe_status_change();
