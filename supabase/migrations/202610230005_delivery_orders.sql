begin;

alter table public.cafes add column delivery_enabled boolean not null default false;
alter table public.orders
  alter column table_id drop not null,
  add column fulfillment_type text not null default 'dine_in',
  add column customer_phone text,
  add column delivery_latitude double precision,
  add column delivery_longitude double precision,
  add constraint orders_fulfillment_check check (
    (fulfillment_type = 'dine_in' and table_id is not null and customer_phone is null and delivery_latitude is null and delivery_longitude is null)
    or (fulfillment_type = 'delivery' and table_id is null
      and customer_phone is not null and customer_phone ~ '^\+?[0-9]{8,15}$'
      and delivery_latitude is not null and delivery_latitude between -90 and 90
      and delivery_longitude is not null and delivery_longitude between -180 and 180)
  );

create table public.delivery_rate_limits (
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  ip_hash text not null, window_start timestamptz not null, request_count integer not null default 1,
  primary key(cafe_id,ip_hash,window_start)
);
alter table public.delivery_rate_limits enable row level security;
revoke all on public.delivery_rate_limits from anon, authenticated;

drop function public.create_public_order_internal(text,text,jsonb,text,uuid,text,text);
create function public.create_public_order_internal(
  p_slug text,p_table_token text,p_items jsonb,p_order_note text,p_idempotency_key uuid,p_tracking_hash text,p_ip_hash text,
  p_fulfillment_type text default 'dine_in',p_customer_phone text default null,
  p_delivery_latitude double precision default null,p_delivery_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_cafe public.cafes;v_table public.cafe_tables;v_existing public.orders;
  v_order_id uuid:=gen_random_uuid();v_ref text;v_total bigint:=0;v_item jsonb;v_product public.products;
  v_qty int;v_expected bigint;v_mismatches jsonb:='[]';
  v_window timestamptz:=to_timestamp(floor(extract(epoch from now())/600)*600);
  v_phone text:=regexp_replace(coalesce(p_customer_phone,''),'[[:space:]().-]','','g');
begin
  if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN' using errcode='42501';end if;
  select * into v_cafe from public.cafes where lower(slug::text)=lower(p_slug) and status='active' and published_version_id is not null for share;
  if v_cafe.id is null then return jsonb_build_object('error','CAFE_UNAVAILABLE');end if;
  if p_fulfillment_type is null or p_fulfillment_type not in ('dine_in','delivery') then return jsonb_build_object('error','INVALID_FULFILLMENT');end if;
  -- Return a previously accepted order even if delivery has since been disabled.
  select * into v_existing from public.orders where cafe_id=v_cafe.id and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.tracking_token_hash is distinct from p_tracking_hash then return jsonb_build_object('error','INVALID_REQUEST');end if;
    return jsonb_build_object('order_id',v_existing.id,'public_ref',v_existing.public_ref,'status',v_existing.status,'idempotent',true);
  end if;
  if p_fulfillment_type='delivery' then
    if not v_cafe.delivery_enabled then return jsonb_build_object('error','DELIVERY_DISABLED');end if;
    if v_phone !~ '^\+?[0-9]{8,15}$' then return jsonb_build_object('error','INVALID_PHONE');end if;
    if p_delivery_latitude is null or p_delivery_longitude is null
      or not (p_delivery_latitude between -90 and 90 and p_delivery_longitude between -180 and 180)
      then return jsonb_build_object('error','LOCATION_REQUIRED');end if;
    insert into public.delivery_rate_limits values(v_cafe.id,p_ip_hash,v_window,1)
      on conflict(cafe_id,ip_hash,window_start) do update set request_count=public.delivery_rate_limits.request_count+1 returning request_count into v_qty;
  else
    select * into v_table from public.cafe_tables where cafe_id=v_cafe.id and active and qr_token_hash=encode(extensions.digest(p_table_token,'sha256'),'hex');
    if v_table.id is null then return jsonb_build_object('error','INVALID_TABLE');end if;
    insert into public.order_rate_limits(cafe_id,table_id,ip_hash,window_start,request_count) values(v_cafe.id,v_table.id,p_ip_hash,v_window,1)
      on conflict(cafe_id,table_id,ip_hash,window_start) do update set request_count=public.order_rate_limits.request_count+1 returning request_count into v_qty;
  end if;
  if v_qty>10 then return jsonb_build_object('error','RATE_LIMITED');end if;
  if length(coalesce(p_order_note,''))>500 then return jsonb_build_object('error','INVALID_NOTE');end if;
  if p_idempotency_key is null or p_tracking_hash is null or length(p_tracking_hash)<>64 then return jsonb_build_object('error','INVALID_REQUEST');end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then return jsonb_build_object('error','INVALID_CART');end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then return jsonb_build_object('error','INVALID_CART');end if;
  if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'productId' having count(*)>1) then return jsonb_build_object('error','INVALID_CART');end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'quantity','') !~ '^[0-9]{1,2}$' or coalesce(v_item->>'expectedPriceMinor','') !~ '^[0-9]{1,15}$'
      or coalesce(v_item->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then return jsonb_build_object('error','INVALID_CART');end if;
    v_qty:=(v_item->>'quantity')::int;v_expected:=(v_item->>'expectedPriceMinor')::bigint;
    if v_qty not between 1 and 20 then return jsonb_build_object('error','INVALID_QUANTITY');end if;
    if length(coalesce(v_item->>'note',''))>200 then return jsonb_build_object('error','INVALID_NOTE');end if;
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and cafe_id=v_cafe.id and active for share;
    if v_product.id is null or not v_product.available then v_mismatches:=v_mismatches||jsonb_build_object('productId',v_item->>'productId','reason','UNAVAILABLE');
    elsif v_product.price_minor<>v_expected then v_mismatches:=v_mismatches||jsonb_build_object('productId',v_product.id,'reason','PRICE_CHANGED','oldPriceMinor',v_expected,'newPriceMinor',v_product.price_minor);
    else v_total:=v_total+v_product.price_minor*v_qty;end if;
  end loop;
  if jsonb_array_length(v_mismatches)>0 then return jsonb_build_object('error','CART_CHANGED','changes',v_mismatches);end if;
  v_ref:=upper(left(regexp_replace(v_cafe.slug::text,'[^a-zA-Z]','','g'),2))||'-'||nextval('public.order_reference_seq');
  insert into public.orders(id,cafe_id,table_id,public_ref,tracking_token_hash,currency,total_minor,order_note,idempotency_key,fulfillment_type,customer_phone,delivery_latitude,delivery_longitude)
    values(v_order_id,v_cafe.id,v_table.id,v_ref,p_tracking_hash,v_cafe.currency,v_total,nullif(trim(p_order_note),''),p_idempotency_key,p_fulfillment_type,
      case when p_fulfillment_type='delivery' then v_phone end,
      case when p_fulfillment_type='delivery' then p_delivery_latitude end,
      case when p_fulfillment_type='delivery' then p_delivery_longitude end);
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and cafe_id=v_cafe.id;
    insert into public.order_items(order_id,cafe_id,product_id,product_name_snapshot,unit_price_minor,quantity,note)
      values(v_order_id,v_cafe.id,v_product.id,v_product.name,v_product.price_minor,(v_item->>'quantity')::int,nullif(left(trim(v_item->>'note'),200),''));
  end loop;
  insert into public.order_status_history(order_id,cafe_id,to_status,version) values(v_order_id,v_cafe.id,'nouvelle',1);
  insert into public.notification_outbox(cafe_id,order_id,event_type) values(v_cafe.id,v_order_id,'order.created');
  return jsonb_build_object('order_id',v_order_id,'public_ref',v_ref,'status','nouvelle');
exception when unique_violation then
  select * into v_existing from public.orders where cafe_id=v_cafe.id and idempotency_key=p_idempotency_key;
  if v_existing.id is null or v_existing.tracking_token_hash is distinct from p_tracking_hash then raise;end if;
  return jsonb_build_object('order_id',v_existing.id,'public_ref',v_existing.public_ref,'status',v_existing.status,'idempotent',true);
end $$;
revoke all on function public.create_public_order_internal(text,text,jsonb,text,uuid,text,text,text,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.create_public_order_internal(text,text,jsonb,text,uuid,text,text,text,text,double precision,double precision) to service_role;

-- Keep the existing menu availability logic; expose the live delivery switch, not a stale snapshot.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.public_get_menu(text,text)'::regprocedure) into definition;
  if position('''cafe'',v_snap->''cafe''' in definition)=0 then raise exception 'Unexpected public_get_menu definition';end if;
  definition:=replace(definition,'''cafe'',v_snap->''cafe''','''cafe'',(v_snap->''cafe'')||jsonb_build_object(''delivery_enabled'',v_cafe.delivery_enabled)');
  execute definition;
  select pg_get_functiondef('public.track_public_order_internal(text)'::regprocedure) into definition;
  definition:=replace(definition,'''table_label'',','''fulfillment_type'',v_order.fulfillment_type,''table_label'',');
  execute definition;
end $$;
notify pgrst, 'reload schema';
commit;
