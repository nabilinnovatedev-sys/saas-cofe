-- Loyalty is independent of menu publication. No public table access or phone-only login.
create table public.loyalty_programs (
 cafe_id uuid primary key references public.cafes(id) on delete cascade,
 enabled boolean not null default false,
 threshold integer not null default 10 check(threshold between 2 and 100),
 reward text not null default 'Un café offert' check(length(trim(reward)) between 2 and 160),
 background_color text not null default '#203B32' check(background_color ~ '^#[0-9a-fA-F]{6}$'),
 surface_color text not null default '#FFF8EB' check(surface_color ~ '^#[0-9a-fA-F]{6}$'),
 text_color text not null default '#203B32' check(text_color ~ '^#[0-9a-fA-F]{6}$'),
 accent_color text not null default '#B67832' check(accent_color ~ '^#[0-9a-fA-F]{6}$'),
 logo_path text,
 stamp text not null default 'coffee' check(stamp in ('coffee','gift','star')),
 template text not null default 'classic' check(template in ('classic','midnight','ticket')),
 updated_at timestamptz not null default now()
);
create trigger loyalty_program_touch before update on public.loyalty_programs for each row execute function public.touch_updated_at();

create table public.loyalty_members (
 id uuid primary key default gen_random_uuid(),
 cafe_id uuid not null references public.loyalty_programs(cafe_id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 phone text not null check(phone ~ '^[1-9][0-9]{7,14}$'),
 credential_hash text not null unique check(credential_hash ~ '^[0-9a-f]{64}$'),
 points integer not null default 0 check(points >= 0),
 created_at timestamptz not null default now(),
 unique(cafe_id,phone), unique(id,cafe_id)
);
create table public.loyalty_tokens (
 id uuid primary key default gen_random_uuid(),
 cafe_id uuid not null references public.loyalty_programs(cafe_id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 kind text not null check(kind in ('award','recover','redeem')),
 member_id uuid,
 issued_by uuid references auth.users(id),
 reward text, cost integer,
 expires_at timestamptz not null default (now()+interval '5 minutes'),
 used_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(member_id,cafe_id) references public.loyalty_members(id,cafe_id)
);
create index loyalty_tokens_cafe on public.loyalty_tokens(cafe_id,created_at desc);
create table public.loyalty_events (
 id bigint generated always as identity primary key,
 cafe_id uuid not null references public.loyalty_programs(cafe_id) on delete cascade,
 member_id uuid not null,
 token_id uuid not null unique references public.loyalty_tokens(id),
 delta integer not null,
 kind text not null check(kind in ('award','recover','redeem')),
 reward text,
 actor_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(member_id,cafe_id) references public.loyalty_members(id,cafe_id)
);
create index loyalty_events_cafe on public.loyalty_events(cafe_id,created_at desc);
create table public.loyalty_rate_limits (
 ip_hash text not null,
 window_start timestamptz not null,
 hits integer not null default 1,
 primary key(ip_hash,window_start)
);
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_tokens enable row level security;
alter table public.loyalty_events enable row level security;
alter table public.loyalty_rate_limits enable row level security;
revoke all on public.loyalty_programs, public.loyalty_members, public.loyalty_tokens, public.loyalty_events, public.loyalty_rate_limits from anon, authenticated;
grant select,insert,update on public.loyalty_programs to authenticated;
grant all on public.loyalty_programs, public.loyalty_members, public.loyalty_tokens, public.loyalty_events, public.loyalty_rate_limits to service_role;
grant usage,select on sequence public.loyalty_events_id_seq to service_role;
create policy loyalty_program_admin on public.loyalty_programs for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy loyalty_program_staff on public.loyalty_programs for select to authenticated using(cafe_id=public.current_waiter_cafe());

-- Edge authenticates staff with getUser; only service_role may invoke this function.
-- All balance/token actions serialize on the program row (including settings updates).
create or replace function public.loyalty_action(p_action text, p_data jsonb, p_actor uuid, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.cafes; p public.loyalty_programs; m public.loyalty_members; t public.loyalty_tokens;
 v_staff boolean := false; v_hits integer; v_events jsonb; v_member jsonb;
begin
 if p_ip_hash is null or length(p_ip_hash)<32 then return jsonb_build_object('error','INVALID_REQUEST'); end if;
 insert into public.loyalty_rate_limits(ip_hash,window_start) values(p_ip_hash,date_trunc('minute',now()))
 on conflict(ip_hash,window_start) do update set hits=public.loyalty_rate_limits.hits+1 returning hits into v_hits;
 if v_hits>60 then return jsonb_build_object('error','RATE_LIMIT'); end if;
 delete from public.loyalty_rate_limits where window_start<now()-interval '1 day';
 if p_actor is not null then
   select * into c from public.cafes where id=(p_data->>'cafe_id')::uuid;
 else
   select * into c from public.cafes where slug::text=p_data->>'slug';
 end if;
 if c.id is null then return jsonb_build_object('error','UNAVAILABLE'); end if;
 if p_actor is not null then
   select exists(select 1 from public.staff_profiles where user_id=p_actor and active
    and (role='platform_admin' or cafe_id=c.id)) into v_staff;
   if not v_staff then return jsonb_build_object('error','FORBIDDEN'); end if;
 end if;
 select * into p from public.loyalty_programs where cafe_id=c.id for update;
 if p.cafe_id is null then return jsonb_build_object('error','NOT_CONFIGURED'); end if;
 if not p.enabled or c.status='suspended' then return jsonb_build_object('error','UNAVAILABLE'); end if;

 if p_action in ('issue','status','search','inspect','redeem','history') and not v_staff then
   return jsonb_build_object('error','FORBIDDEN');
 end if;

 if p_action='issue' then
   if p_data->>'kind' not in ('award','recover') then return jsonb_build_object('error','INVALID_REQUEST'); end if;
   if p_data->>'kind'='recover' then
     select * into m from public.loyalty_members where cafe_id=c.id and id=(p_data->>'member_id')::uuid;
     if m.id is null then return jsonb_build_object('error','NOT_FOUND'); end if;
   end if;
   -- A new issue replaces this employee's unused QR of the same kind.
   update public.loyalty_tokens set expires_at=now() where cafe_id=c.id and issued_by=p_actor
     and kind=p_data->>'kind' and used_at is null and expires_at>now();
   insert into public.loyalty_tokens(cafe_id,kind,token_hash,member_id,issued_by)
   values(c.id,p_data->>'kind',p_data->>'new_hash',m.id,p_actor) returning * into t;
   return jsonb_build_object('id',t.id,'expires_at',t.expires_at,'slug',c.slug);
 elsif p_action='status' then
   select * into t from public.loyalty_tokens where cafe_id=c.id and id=(p_data->>'id')::uuid;
   if t.id is null then return jsonb_build_object('error','NOT_FOUND'); end if;
   return jsonb_build_object('used',t.used_at is not null,'expired',t.expires_at<=now());
 elsif p_action='search' then
   select * into m from public.loyalty_members where cafe_id=c.id and phone=p_data->>'phone';
   if m.id is null then return jsonb_build_object('error','NOT_FOUND'); end if;
   return jsonb_build_object('member',jsonb_build_object('id',m.id,'name',m.name,'phone',m.phone,'points',m.points));
 elsif p_action='history' then
   select coalesce(jsonb_agg(x),'[]') into v_events from (
     select e.kind,e.delta,e.reward,e.created_at,m.name
     from public.loyalty_events e join public.loyalty_members m on m.id=e.member_id
     where e.cafe_id=c.id order by e.created_at desc,e.id desc limit 30
   ) x;
   return jsonb_build_object('events',v_events);
 elsif p_action in ('inspect','redeem') then
   select * into t from public.loyalty_tokens where cafe_id=c.id and token_hash=p_data->>'token_hash' and kind='redeem';
   if t.id is null then return jsonb_build_object('error','INVALID_CODE'); end if;
   if t.used_at is not null then return jsonb_build_object('error','ALREADY_USED'); end if;
   if t.expires_at<=now() then return jsonb_build_object('error','EXPIRED'); end if;
   if t.cost<>p.threshold or t.reward<>p.reward then return jsonb_build_object('error','PROGRAM_CHANGED'); end if;
   select * into m from public.loyalty_members where id=t.member_id for update;
   if m.points<t.cost then return jsonb_build_object('error','NOT_ENOUGH_POINTS'); end if;
   if p_action='redeem' then
     update public.loyalty_members set points=points-t.cost where id=m.id returning * into m;
     update public.loyalty_tokens set used_at=now() where id=t.id;
     insert into public.loyalty_events(cafe_id,member_id,token_id,delta,kind,reward,actor_id)
       values(c.id,m.id,t.id,-t.cost,'redeem',t.reward,p_actor);
   end if;
   return jsonb_build_object('name',m.name,'phone_suffix',right(m.phone,4),'reward',t.reward,'cost',t.cost,'points',m.points);
 end if;

 -- Customer session is a random device credential, not a phone-number lookup.
 select * into m from public.loyalty_members where cafe_id=c.id and credential_hash=p_data->>'credential_hash';
 if p_action='join' then
   if m.id is null then
     if exists(select 1 from public.loyalty_members where cafe_id=c.id and phone=p_data->>'phone') then
       return jsonb_build_object('error','STAFF_RECOVERY_REQUIRED');
     end if;
     insert into public.loyalty_members(cafe_id,name,phone,credential_hash)
       values(c.id,trim(p_data->>'name'),p_data->>'phone',p_data->>'credential_hash') returning * into m;
   end if;
 elsif p_action='claim' then
   select * into t from public.loyalty_tokens where cafe_id=c.id and token_hash=p_data->>'token_hash' and kind in ('award','recover');
   if t.id is null then return jsonb_build_object('error','INVALID_CODE'); end if;
   if t.used_at is not null then
     if m.id is null or t.member_id<>m.id then return jsonb_build_object('error','ALREADY_USED'); end if;
     -- Same device retry is safe after a lost response.
   else
     if t.expires_at<=now() then return jsonb_build_object('error','EXPIRED'); end if;
     if t.kind='recover' then
       update public.loyalty_members set credential_hash=p_data->>'credential_hash' where id=t.member_id returning * into m;
       update public.loyalty_tokens set expires_at=now() where member_id=m.id
         and kind in ('recover','redeem') and used_at is null and id<>t.id;
     elsif m.id is null then
       return jsonb_build_object('error','JOIN_FIRST');
     end if;
     if t.kind='award' then
       update public.loyalty_members set points=points+1 where id=m.id returning * into m;
     end if;
     update public.loyalty_tokens set used_at=now(),member_id=m.id where id=t.id;
     insert into public.loyalty_events(cafe_id,member_id,token_id,delta,kind,actor_id)
       values(c.id,m.id,t.id,case when t.kind='award' then 1 else 0 end,t.kind,t.issued_by);
   end if;
 elsif p_action='reward_code' then
   if m.id is null then return jsonb_build_object('error','JOIN_FIRST'); end if;
   if m.points<p.threshold then return jsonb_build_object('error','NOT_ENOUGH_POINTS'); end if;
   update public.loyalty_tokens set expires_at=now() where member_id=m.id and kind='redeem' and used_at is null;
   insert into public.loyalty_tokens(cafe_id,kind,member_id,token_hash,cost,reward)
     values(c.id,'redeem',m.id,p_data->>'new_hash',p.threshold,p.reward) returning * into t;
   return jsonb_build_object('expires_at',t.expires_at);
 elsif p_action<>'view' then
   return jsonb_build_object('error','INVALID_REQUEST');
 end if;
 if m.id is not null then
   v_member:=jsonb_build_object('name',m.name,'phone',m.phone,'points',m.points,'created_at',m.created_at);
 end if;
 return jsonb_build_object('program',to_jsonb(p)-'cafe_id','cafe',jsonb_build_object('name',c.name,'slug',c.slug),'member',v_member);
end $$;
revoke all on function public.loyalty_action(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.loyalty_action(text,jsonb,uuid,text) to service_role;
