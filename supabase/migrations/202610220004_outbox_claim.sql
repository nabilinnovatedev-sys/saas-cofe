create or replace function public.claim_notification_outbox(p_limit integer default 50)
returns setof public.notification_outbox
language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 return query
 with picked as (
  select id from public.notification_outbox
  where processed_at is null and available_at<=now() and (claimed_at is null or claimed_at<now()-interval '5 minutes')
  order by created_at
  for update skip locked
  limit least(greatest(p_limit,1),100)
 )
 update public.notification_outbox o set claimed_at=now(),attempts=o.attempts+1
 from picked where o.id=picked.id returning o.*;
end $$;
revoke all on function public.claim_notification_outbox(integer) from public;
grant execute on function public.claim_notification_outbox(integer) to service_role;
