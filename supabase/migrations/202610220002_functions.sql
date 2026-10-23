create or replace function public.admin_create_table(p_cafe_id uuid,p_label text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_token text:=encode(extensions.gen_random_bytes(32),'hex');v_id uuid;
begin
 if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 insert into public.cafe_tables(cafe_id,label,qr_token_hash) values(p_cafe_id,trim(p_label),encode(extensions.digest(v_token,'sha256'),'hex')) returning id into v_id;
 insert into public.audit_events(cafe_id,actor_user_id,action,target_type,target_id) values(p_cafe_id,auth.uid(),'table.created','cafe_table',v_id::text);
 return jsonb_build_object('id',v_id,'label',trim(p_label),'token',v_token);
end $$;
revoke all on function public.admin_create_table(uuid,text) from public;grant execute on function public.admin_create_table(uuid,text) to authenticated;

create or replace function public.admin_rotate_table_token(p_table_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_token text:=encode(extensions.gen_random_bytes(32),'hex');v_cafe uuid;
begin
 if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 update public.cafe_tables set qr_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),rotated_at=now() where id=p_table_id returning cafe_id into v_cafe;
 if v_cafe is null then raise exception 'TABLE_NOT_FOUND';end if;
 insert into public.audit_events(cafe_id,actor_user_id,action,target_type,target_id) values(v_cafe,auth.uid(),'table.qr_rotated','cafe_table',p_table_id::text);
 return jsonb_build_object('token',v_token);
end $$;
revoke all on function public.admin_rotate_table_token(uuid) from public;grant execute on function public.admin_rotate_table_token(uuid) to authenticated;

create or replace function public.admin_publish_cafe(p_cafe_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_version int;v_snapshot jsonb;v_id uuid;
begin
 if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if not exists(select 1 from public.cafe_branding where cafe_id=p_cafe_id) then raise exception 'BRANDING_REQUIRED';end if;
 if not exists(select 1 from public.products where cafe_id=p_cafe_id and active) then raise exception 'PRODUCT_REQUIRED';end if;
 select coalesce(max(version_no),0)+1 into v_version from public.publication_versions where cafe_id=p_cafe_id;
 select jsonb_build_object('cafe',jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'currency',c.currency,'description',b.description,'primary_color',b.primary_color,'secondary_color',b.secondary_color,'accent_color',b.accent_color,'logo_url',b.logo_path,'contact_phone',c.contact_phone,'contact_address',c.contact_address),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',mc.id,'name',mc.name,'sort_order',mc.sort_order,'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'category_id',p.category_id,'name',p.name,'description',p.description,'price_minor',p.price_minor,'photo_url',p.photo_path,'available',p.available,'sort_order',p.sort_order) order by p.sort_order) from public.products p where p.category_id=mc.id and p.active),'[]'::jsonb)) order by mc.sort_order) from public.menu_categories mc where mc.cafe_id=c.id and mc.active),'[]'::jsonb)) into v_snapshot
 from public.cafes c join public.cafe_branding b on b.cafe_id=c.id where c.id=p_cafe_id;
 insert into public.publication_versions(cafe_id,version_no,snapshot,published_by) values(p_cafe_id,v_version,v_snapshot,auth.uid()) returning id into v_id;
 update public.cafes set published_version_id=v_id,status=case when status='draft' then 'active' else status end where id=p_cafe_id;
 insert into public.audit_events(cafe_id,actor_user_id,action,target_type,target_id,metadata) values(p_cafe_id,auth.uid(),'cafe.published','publication',v_id::text,jsonb_build_object('version',v_version));
 return jsonb_build_object('id',v_id,'version_no',v_version);
end $$;
revoke all on function public.admin_publish_cafe(uuid) from public;grant execute on function public.admin_publish_cafe(uuid) to authenticated;

create or replace function public.public_get_menu(p_slug text,p_table_token text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_cafe public.cafes;v_snap jsonb;v_table public.cafe_tables;v_categories jsonb;
begin
 select * into v_cafe from public.cafes where slug=p_slug::extensions.citext and status='active' and published_version_id is not null;
 if v_cafe.id is null then return null;end if;
 select snapshot into v_snap from public.publication_versions where id=v_cafe.published_version_id;
 if p_table_token is not null then select * into v_table from public.cafe_tables where cafe_id=v_cafe.id and active and qr_token_hash=encode(extensions.digest(p_table_token,'sha256'),'hex');end if;
 select coalesce(jsonb_agg(cat.category_json order by cat.sort_order),'[]'::jsonb) into v_categories from(
  select (c.value-'products')||jsonb_build_object('products',coalesce((select jsonb_agg(jsonb_set(p.value,'{available}',to_jsonb(coalesce(live.available,false))) order by (p.value->>'sort_order')::int) from jsonb_array_elements(c.value->'products') p(value) left join public.products live on live.id=(p.value->>'id')::uuid),'[]'::jsonb)) category_json,(c.value->>'sort_order')::int sort_order
  from jsonb_array_elements(v_snap->'categories') c(value)
 ) cat;
 return jsonb_build_object('cafe',v_snap->'cafe','categories',v_categories,'table',jsonb_build_object('valid',v_table.id is not null,'id',v_table.id,'label',v_table.label));
end $$;
revoke all on function public.public_get_menu(text,text) from public;grant execute on function public.public_get_menu(text,text) to anon,authenticated;

create or replace function public.create_public_order_internal(p_slug text,p_table_token text,p_items jsonb,p_order_note text,p_idempotency_key uuid,p_tracking_hash text,p_ip_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_cafe public.cafes;v_table public.cafe_tables;v_existing public.orders;v_order_id uuid:=gen_random_uuid();v_ref text;v_total bigint:=0;v_item jsonb;v_product public.products;v_qty int;v_expected bigint;v_mismatches jsonb:='[]';v_window timestamptz:=to_timestamp(floor(extract(epoch from now())/600)*600);
begin
 if auth.role()<>'service_role' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into v_cafe from public.cafes where slug=p_slug::extensions.citext and status='active' and published_version_id is not null;
 if v_cafe.id is null then return jsonb_build_object('error','CAFE_UNAVAILABLE');end if;
 select * into v_table from public.cafe_tables where cafe_id=v_cafe.id and active and qr_token_hash=encode(extensions.digest(p_table_token,'sha256'),'hex');
 if v_table.id is null then return jsonb_build_object('error','INVALID_TABLE');end if;
 select * into v_existing from public.orders where cafe_id=v_cafe.id and idempotency_key=p_idempotency_key;
 if v_existing.id is not null then return jsonb_build_object('order_id',v_existing.id,'public_ref',v_existing.public_ref,'status',v_existing.status,'idempotent',true);end if;
 if length(coalesce(p_order_note,''))>500 then return jsonb_build_object('error','INVALID_NOTE');end if;
 insert into public.order_rate_limits(cafe_id,table_id,ip_hash,window_start,request_count) values(v_cafe.id,v_table.id,p_ip_hash,v_window,1)
 on conflict(cafe_id,table_id,ip_hash,window_start) do update set request_count=public.order_rate_limits.request_count+1 returning request_count into v_qty;
 if v_qty>10 then return jsonb_build_object('error','RATE_LIMITED');end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then return jsonb_build_object('error','INVALID_CART');end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'productId' having count(*)>1) then return jsonb_build_object('error','INVALID_CART');end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
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
 insert into public.orders(id,cafe_id,table_id,public_ref,tracking_token_hash,currency,total_minor,order_note,idempotency_key) values(v_order_id,v_cafe.id,v_table.id,v_ref,p_tracking_hash,v_cafe.currency,v_total,nullif(trim(p_order_note),''),p_idempotency_key);
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_product from public.products where id=(v_item->>'productId')::uuid and cafe_id=v_cafe.id;
  insert into public.order_items(order_id,cafe_id,product_id,product_name_snapshot,unit_price_minor,quantity,note) values(v_order_id,v_cafe.id,v_product.id,v_product.name,v_product.price_minor,(v_item->>'quantity')::int,nullif(left(trim(v_item->>'note'),200),''));
 end loop;
 insert into public.order_status_history(order_id,cafe_id,to_status,version) values(v_order_id,v_cafe.id,'nouvelle',1);
 insert into public.notification_outbox(cafe_id,order_id,event_type) values(v_cafe.id,v_order_id,'order.created');
 return jsonb_build_object('order_id',v_order_id,'public_ref',v_ref,'status','nouvelle');
exception when unique_violation then
 select * into v_existing from public.orders where cafe_id=v_cafe.id and idempotency_key=p_idempotency_key;
 return jsonb_build_object('order_id',v_existing.id,'public_ref',v_existing.public_ref,'status',v_existing.status,'idempotent',true);
end $$;
revoke all on function public.create_public_order_internal(text,text,jsonb,text,uuid,text,text) from public;
grant execute on function public.create_public_order_internal(text,text,jsonb,text,uuid,text,text) to service_role;

create or replace function public.track_public_order_internal(p_tracking_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_order public.orders;
begin
 if auth.role()<>'service_role' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into v_order from public.orders where tracking_token_hash=p_tracking_hash;
 if v_order.id is null then return null;end if;
 return jsonb_build_object('order_id',v_order.id,'public_ref',v_order.public_ref,'status',v_order.status,'currency',v_order.currency,'total_minor',v_order.total_minor,'cancel_reason',v_order.cancel_reason,'created_at',v_order.created_at,'table_label',(select label from public.cafe_tables where id=v_order.table_id),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.order_items i where i.order_id=v_order.id),'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at),'[]'::jsonb) from public.order_status_history h where h.order_id=v_order.id));
end $$;
revoke all on function public.track_public_order_internal(text) from public;
grant execute on function public.track_public_order_internal(text) to service_role;

create or replace function public.transition_order(p_order_id uuid,p_expected_version int,p_to_status order_status,p_reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_order public.orders;v_allowed boolean:=false;
begin
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null or not(public.is_platform_admin() or v_order.cafe_id=public.current_waiter_cafe()) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if v_order.version<>p_expected_version then return jsonb_build_object('error','CONFLICT','current',to_jsonb(v_order));end if;
 v_allowed:=(v_order.status='nouvelle' and p_to_status='acceptee') or (v_order.status='acceptee' and p_to_status='en_preparation') or (v_order.status='en_preparation' and p_to_status='prete') or (v_order.status='prete' and p_to_status='servie') or (v_order.status not in('servie','annulee') and p_to_status='annulee' and length(trim(coalesce(p_reason,'')))>0);
 if not v_allowed then return jsonb_build_object('error','INVALID_TRANSITION','current',to_jsonb(v_order));end if;
 update public.orders set status=p_to_status,version=version+1,cancel_reason=case when p_to_status='annulee' then trim(p_reason) else cancel_reason end,accepted_by=case when p_to_status='acceptee' then auth.uid() else accepted_by end where id=p_order_id and version=p_expected_version;
 insert into public.order_status_history(order_id,cafe_id,from_status,to_status,actor_user_id,reason,version) values(v_order.id,v_order.cafe_id,v_order.status,p_to_status,auth.uid(),nullif(trim(p_reason),''),v_order.version+1);
 select * into v_order from public.orders where id=p_order_id;return to_jsonb(v_order);
end $$;
revoke all on function public.transition_order(uuid,int,order_status,text) from public;grant execute on function public.transition_order(uuid,int,order_status,text) to authenticated;
