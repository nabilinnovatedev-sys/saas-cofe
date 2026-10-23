create table public.push_delivery_tickets (
 ticket_id text primary key,
 device_token_id uuid not null references public.device_push_tokens(id) on delete cascade,
 outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
 status text not null default 'pending' check(status in('pending','ok','error')),
 error_code text,
 checked_at timestamptz,
 created_at timestamptz not null default now()
);
create index push_tickets_pending_idx on public.push_delivery_tickets(status,created_at) where checked_at is null;
alter table public.push_delivery_tickets enable row level security;

create or replace function public.claim_push_tickets(p_limit integer default 100)
returns setof public.push_delivery_tickets
language sql security definer set search_path='' as $$
 select * from public.push_delivery_tickets
 where checked_at is null and created_at<now()-interval '2 minutes'
 order by created_at limit least(greatest(p_limit,1),300)
$$;
revoke all on function public.claim_push_tickets(integer) from public;
grant execute on function public.claim_push_tickets(integer) to service_role;
