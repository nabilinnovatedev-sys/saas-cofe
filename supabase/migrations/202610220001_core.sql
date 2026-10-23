create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.cafe_status as enum ('draft','active','suspended');
create type public.staff_role as enum ('platform_admin','waiter');
create type public.order_status as enum ('nouvelle','acceptee','en_preparation','prete','servie','annulee');

create table public.cafes (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
 slug citext not null unique check(slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), status cafe_status not null default 'draft',
 currency char(3) not null default 'MAD' check(currency ~ '^[A-Z]{3}$'), timezone text not null default 'Africa/Casablanca',
 contact_phone text, contact_address text, published_version_id uuid, suspension_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
 ,constraint suspended_reason_required check(status<>'suspended' or length(trim(suspension_reason))>0)
);
create index cafes_status_idx on public.cafes(status);

create table public.cafe_branding (
 cafe_id uuid primary key references public.cafes(id) on delete cascade, logo_path text,
 primary_color char(7) not null default '#8B5E3C' check(primary_color ~ '^#[0-9A-Fa-f]{6}$'),
 secondary_color char(7) not null default '#557A64' check(secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
 accent_color char(7) not null default '#D98C32' check(accent_color ~ '^#[0-9A-Fa-f]{6}$'),
 description text check(length(description)<=1000), updated_at timestamptz not null default now()
);

create table public.staff_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade, cafe_id uuid references public.cafes(id),
 role staff_role not null, active boolean not null default true, display_name text not null check(length(display_name) between 1 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint staff_role_cafe_check check((role='platform_admin' and cafe_id is null) or (role='waiter' and cafe_id is not null))
);
create index staff_profiles_cafe_active_idx on public.staff_profiles(cafe_id,active);

create table public.menu_categories (
 id uuid primary key default gen_random_uuid(), cafe_id uuid not null references public.cafes(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), sort_order integer not null default 0, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,cafe_id), unique(cafe_id,name)
);
create index menu_categories_menu_idx on public.menu_categories(cafe_id,active,sort_order);

create table public.products (
 id uuid primary key default gen_random_uuid(), cafe_id uuid not null references public.cafes(id) on delete cascade,
 category_id uuid not null, name text not null check(length(name) between 1 and 120), description text check(length(description)<=1000),
 price_minor bigint not null check(price_minor>=0), photo_path text, available boolean not null default true,
 active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,cafe_id), constraint products_category_tenant_fk foreign key(category_id,cafe_id) references public.menu_categories(id,cafe_id)
);
create index products_menu_idx on public.products(cafe_id,category_id,active,sort_order);

create table public.cafe_tables (
 id uuid primary key default gen_random_uuid(), cafe_id uuid not null references public.cafes(id) on delete cascade,
 label text not null check(length(label) between 1 and 50), qr_token_hash text not null unique check(length(qr_token_hash)=64),
 active boolean not null default true, rotated_at timestamptz not null default now(), created_at timestamptz not null default now(),
 unique(id,cafe_id), unique(cafe_id,label)
);

create table public.publication_versions (
 id uuid primary key default gen_random_uuid(), cafe_id uuid not null references public.cafes(id) on delete cascade,
 version_no integer not null check(version_no>0), snapshot jsonb not null, published_at timestamptz not null default now(),
 published_by uuid not null references auth.users(id), unique(cafe_id,version_no)
);
alter table public.cafes add constraint cafes_published_version_fk foreign key(published_version_id) references public.publication_versions(id);

create sequence public.order_reference_seq start 1000;
create table public.orders (
 id uuid primary key default gen_random_uuid(), cafe_id uuid not null, table_id uuid not null,
 public_ref text not null, tracking_token_hash text not null unique check(length(tracking_token_hash)=64), status order_status not null default 'nouvelle',
 currency char(3) not null, total_minor bigint not null check(total_minor>=0), order_note text check(length(order_note)<=500),
 idempotency_key uuid not null, version integer not null default 1 check(version>0), cancel_reason text,
 accepted_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,cafe_id), unique(cafe_id,idempotency_key), unique(cafe_id,public_ref),
 constraint orders_cafe_fk foreign key(cafe_id) references public.cafes(id),
 constraint orders_table_tenant_fk foreign key(table_id,cafe_id) references public.cafe_tables(id,cafe_id)
);
create index orders_active_idx on public.orders(cafe_id,status,created_at desc);
create index orders_history_idx on public.orders(cafe_id,created_at desc);

create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null, cafe_id uuid not null, product_id uuid,
 product_name_snapshot text not null, unit_price_minor bigint not null check(unit_price_minor>=0), quantity integer not null check(quantity between 1 and 20),
 line_total_minor bigint generated always as(unit_price_minor*quantity) stored, note text check(length(note)<=200),
 constraint items_order_tenant_fk foreign key(order_id,cafe_id) references public.orders(id,cafe_id) on delete cascade,
 constraint items_product_tenant_fk foreign key(product_id,cafe_id) references public.products(id,cafe_id)
);
create index order_items_order_idx on public.order_items(order_id);

create table public.order_status_history (
 id uuid primary key default gen_random_uuid(), order_id uuid not null, cafe_id uuid not null, from_status order_status,
 to_status order_status not null, actor_user_id uuid references auth.users(id), reason text, version integer not null,
 created_at timestamptz not null default now(), unique(order_id,version),
 constraint history_order_tenant_fk foreign key(order_id,cafe_id) references public.orders(id,cafe_id) on delete cascade
);
create index order_history_idx on public.order_status_history(order_id,created_at);

create table public.device_push_tokens (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 cafe_id uuid not null references public.cafes(id) on delete cascade, platform text not null check(platform in('ios','android')),
 token_hash text not null unique, token_ciphertext text not null, active boolean not null default true,
 failure_count integer not null default 0, last_seen_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index push_tokens_active_idx on public.device_push_tokens(cafe_id,active);

create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), cafe_id uuid not null references public.cafes(id), order_id uuid not null,
 event_type text not null, attempts integer not null default 0, available_at timestamptz not null default now(),
 claimed_at timestamptz, processed_at timestamptz, last_error text, created_at timestamptz not null default now(),
 constraint outbox_order_tenant_fk foreign key(order_id,cafe_id) references public.orders(id,cafe_id) on delete cascade
);
create index outbox_pending_idx on public.notification_outbox(processed_at,available_at);

create table public.audit_events (
 id bigint generated always as identity primary key, cafe_id uuid references public.cafes(id), actor_user_id uuid references auth.users(id),
 action text not null, target_type text not null, target_id text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_cafe_date_idx on public.audit_events(cafe_id,created_at desc);

create table public.order_rate_limits (
 cafe_id uuid not null references public.cafes(id) on delete cascade, table_id uuid not null,
 ip_hash text not null, window_start timestamptz not null, request_count integer not null default 1,
 primary key(cafe_id,table_id,ip_hash,window_start)
);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger cafes_touch before update on public.cafes for each row execute function public.touch_updated_at();
create trigger staff_touch before update on public.staff_profiles for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.menu_categories for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_profiles where user_id=auth.uid() and role='platform_admin' and active)
$$;
create or replace function public.current_waiter_cafe() returns uuid language sql stable security definer set search_path='' as $$
 select cafe_id from public.staff_profiles where user_id=auth.uid() and role='waiter' and active
$$;
revoke all on function public.is_platform_admin() from public; grant execute on function public.is_platform_admin() to authenticated;
revoke all on function public.current_waiter_cafe() from public; grant execute on function public.current_waiter_cafe() to authenticated;

alter table public.cafes enable row level security; alter table public.cafe_branding enable row level security;
alter table public.staff_profiles enable row level security; alter table public.menu_categories enable row level security;
alter table public.products enable row level security; alter table public.cafe_tables enable row level security;
alter table public.publication_versions enable row level security; alter table public.orders enable row level security;
alter table public.order_items enable row level security; alter table public.order_status_history enable row level security;
alter table public.device_push_tokens enable row level security; alter table public.notification_outbox enable row level security;
alter table public.audit_events enable row level security; alter table public.order_rate_limits enable row level security;

create policy admin_all_cafes on public.cafes for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy waiter_assigned_cafe_read on public.cafes for select to authenticated using(id=public.current_waiter_cafe());
create policy admin_all_branding on public.cafe_branding for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy profiles_select on public.staff_profiles for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
create policy admin_profiles_write on public.staff_profiles for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy admin_all_categories on public.menu_categories for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy admin_all_products on public.products for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy admin_all_tables on public.cafe_tables for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy admin_all_publications on public.publication_versions for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy orders_select_staff on public.orders for select to authenticated using(public.is_platform_admin() or cafe_id=public.current_waiter_cafe());
create policy items_select_staff on public.order_items for select to authenticated using(public.is_platform_admin() or cafe_id=public.current_waiter_cafe());
create policy history_select_staff on public.order_status_history for select to authenticated using(public.is_platform_admin() or cafe_id=public.current_waiter_cafe());
create policy admin_audit_select on public.audit_events for select to authenticated using(public.is_platform_admin());
create policy token_own_select on public.device_push_tokens for select to authenticated using(user_id=auth.uid());

grant usage on schema public to anon,authenticated;
grant select,insert,update,delete on public.cafes,public.cafe_branding,public.menu_categories,public.products,public.cafe_tables to authenticated;
grant select on public.staff_profiles,public.publication_versions,public.orders,public.order_items,public.order_status_history,public.audit_events,public.device_push_tokens to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('cafe-branding','cafe-branding',true,2097152,array['image/jpeg','image/png','image/webp']),
 ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy public_read_cafe_images on storage.objects for select to public using(bucket_id in('cafe-branding','product-images'));
create policy admin_upload_cafe_images on storage.objects for insert to authenticated with check(bucket_id in('cafe-branding','product-images') and public.is_platform_admin());
create policy admin_update_cafe_images on storage.objects for update to authenticated using(bucket_id in('cafe-branding','product-images') and public.is_platform_admin());
create policy admin_delete_cafe_images on storage.objects for delete to authenticated using(bucket_id in('cafe-branding','product-images') and public.is_platform_admin());

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
  alter publication supabase_realtime add table public.orders;
 end if;
end $$;
