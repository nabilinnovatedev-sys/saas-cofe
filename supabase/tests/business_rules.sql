begin;
select plan(13);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001','authenticated','authenticated','waiter-a@test.local',crypt('test-password',gen_salt('bf')),now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000002','authenticated','authenticated','waiter-b@test.local',crypt('test-password',gen_salt('bf')),now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000003','authenticated','authenticated','publisher@test.local',crypt('test-password',gen_salt('bf')),now(),'{}','{}',now(),now());

insert into public.cafes(id,name,slug,status,currency) values
 ('20000000-0000-0000-0000-000000000001','Café A','cafe-a','active','MAD'),
 ('20000000-0000-0000-0000-000000000002','Café B','cafe-b','active','MAD');
insert into public.cafe_branding(cafe_id) values('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
insert into public.menu_categories(id,cafe_id,name) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Cafés'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Cafés');
insert into public.products(id,cafe_id,category_id,name,price_minor) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Café A',3200),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Café B',2400);
insert into public.cafe_tables(id,cafe_id,label,qr_token_hash) values
 ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','T01',encode(digest('table-a','sha256'),'hex')),
 ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','T01',encode(digest('table-b','sha256'),'hex'));
insert into public.publication_versions(id,cafe_id,version_no,snapshot,published_by) values
 ('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'{}','10000000-0000-0000-0000-000000000003'),
 ('60000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',1,'{}','10000000-0000-0000-0000-000000000003');
update public.cafes set published_version_id=case when slug='cafe-a' then '60000000-0000-0000-0000-000000000001'::uuid else '60000000-0000-0000-0000-000000000002'::uuid end;
insert into public.staff_profiles(user_id,cafe_id,role,display_name) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','waiter','Serveur A'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','waiter','Serveur B');

create temporary table results(name text primary key,value jsonb);
grant all on table results to service_role,authenticated;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into results values('price',public.create_public_order_internal('cafe-a','table-a','[{"productId":"40000000-0000-0000-0000-000000000001","quantity":1,"expectedPriceMinor":1}]',null,'70000000-0000-0000-0000-000000000001',encode(digest('track-price','sha256'),'hex'),'ip-a'));
select is((select value->>'error' from results where name='price'),'CART_CHANGED','un faux prix est refusé');
select is((select count(*)::int from public.orders),0,'aucune commande après divergence de prix');

insert into results values('a1',public.create_public_order_internal('cafe-a','table-a','[{"productId":"40000000-0000-0000-0000-000000000001","quantity":2,"expectedPriceMinor":3200}]',null,'70000000-0000-0000-0000-000000000002',encode(digest('track-a','sha256'),'hex'),'ip-a'));
insert into results values('a2',public.create_public_order_internal('cafe-a','table-a','[{"productId":"40000000-0000-0000-0000-000000000001","quantity":2,"expectedPriceMinor":3200}]',null,'70000000-0000-0000-0000-000000000002',encode(digest('track-a','sha256'),'hex'),'ip-a'));
insert into results values('b1',public.create_public_order_internal('cafe-b','table-b','[{"productId":"40000000-0000-0000-0000-000000000002","quantity":1,"expectedPriceMinor":2400}]',null,'70000000-0000-0000-0000-000000000003',encode(digest('track-b','sha256'),'hex'),'ip-b'));
select is((select value->>'order_id' from results where name='a1'),(select value->>'order_id' from results where name='a2'),'un retry retourne la même commande');
select is((select count(*)::int from public.orders where cafe_id='20000000-0000-0000-0000-000000000001'),1,'idempotence: une ligne seulement');
select is((select total_minor::bigint from public.orders where cafe_id='20000000-0000-0000-0000-000000000001'),6400::bigint,'total recalculé côté serveur');
select is((public.track_public_order_internal(encode(digest('track-a','sha256'),'hex'))->>'total_minor')::bigint,6400::bigint,'le bon jeton suit la commande');
select is(public.track_public_order_internal(encode(digest('mauvais','sha256'),'hex')),null,'un mauvais jeton ne divulgue rien');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001"}',true);
select is((select count(*)::int from public.orders),1,'le serveur A ne lit que son café');
select is((select count(*)::int from public.orders where cafe_id='20000000-0000-0000-0000-000000000002'),0,'la lecture croisée A vers B est vide');
insert into results values('transition',public.transition_order((select (value->>'order_id')::uuid from results where name='a1'),1,'acceptee',null));
select is((select value->>'status' from results where name='transition'),'acceptee','transition canonique acceptée');
select is((public.transition_order((select (value->>'order_id')::uuid from results where name='a1'),1,'acceptee',null)->>'error'),'CONFLICT','une version obsolète reçoit un conflit');
select is((public.transition_order((select (value->>'order_id')::uuid from results where name='a1'),2,'servie',null)->>'error'),'INVALID_TRANSITION','un saut de statut est refusé');
select is((select count(*)::int from public.order_status_history where order_id=(select (value->>'order_id')::uuid from results where name='a1')),2,'aucun historique parasite après conflits');

select * from finish();
rollback;
