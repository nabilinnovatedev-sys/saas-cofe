// In-memory PostgreSQL tests: no production credentials or data.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const db = new PGlite();
const cafeA = '00000000-0000-4000-8000-000000000001';
const cafeB = '00000000-0000-4000-8000-000000000002';
const staffA = '00000000-0000-4000-8000-000000000003';
const staffB = '00000000-0000-4000-8000-000000000004';
const inactive = '00000000-0000-4000-8000-000000000005';
const hash = value => createHash('sha256').update(value).digest('hex');
const device = hash('device');
const payload = { slug: 'cafe-a', credential_hash: device };
let sequence = 0;
const api = async (action, data = {}, actor = null, ip = hash('ip')) => {
  const result = await db.query('select public.loyalty_action($1,$2::jsonb,$3::uuid,$4) as result', [action, JSON.stringify(data), actor, ip]);
  return result.rows[0].result;
};
const join = (data = {}) => api('join', { ...payload, name: 'Client A', phone: '212612345678', ...data });
const issue = async (data = {}, actor = staffA) => {
  const token_hash = hash(`grant-${++sequence}`);
  const result = await api('issue', { cafe_id: cafeA, kind: 'award', new_hash: token_hash, ...data }, actor);
  return { ...result, token_hash };
};
const claim = token => api('claim', { ...payload, token_hash: token.token_hash });
const points = async n => { for (let i = 0; i < n; i++) assert.equal((await claim(await issue())).member.points, i + 1); };

before(async () => {
  // Minimal existing app contracts; actual loyalty migration runs unchanged below.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.cafes(id uuid primary key,name text,slug text,status text);
    create table public.staff_profiles(user_id uuid primary key,cafe_id uuid,role text,active boolean);
    create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
    create function public.is_platform_admin() returns boolean language sql as $$ select false $$;
    create function public.current_waiter_cafe() returns uuid language sql as $$ select null::uuid $$;
    insert into auth.users values('${staffA}'),('${staffB}'),('${inactive}');
    insert into public.cafes values('${cafeA}','Café A','cafe-a','active'),('${cafeB}','Café B','cafe-b','active');
    insert into public.staff_profiles values('${staffA}','${cafeA}','waiter',true),('${staffB}','${cafeB}','waiter',true),('${inactive}','${cafeA}','waiter',false);
  `);
  await db.exec(await readFile(new URL('../migrations/202610260003_loyalty.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await db.exec(`truncate public.loyalty_events,public.loyalty_tokens,public.loyalty_members,public.loyalty_programs,public.loyalty_rate_limits cascade;
    update public.cafes set status='active';
    insert into public.loyalty_programs(cafe_id,enabled,threshold) values('${cafeA}',true,2),('${cafeB}',true,10);`);
});
after(() => db.close());

test('enrollment creates a card with zero points; same device retry is idempotent', async () => {
  assert.equal((await join()).member.points, 0);
  assert.equal((await join()).member.points, 0);
  assert.equal((await db.query('select count(*)::int as count from loyalty_members')).rows[0].count, 1);
});
test('phone alone never opens or overwrites an existing card', async () => {
  await join();
  assert.equal((await join({ credential_hash: hash('other'), name: 'Attacker' })).error, 'STAFF_RECOVERY_REQUIRED');
  assert.equal((await api('view', { slug: 'cafe-a', credential_hash: hash('other') })).member, null);
  assert.equal((await api('view', payload)).member.name, 'Client A');
});
test('one-use award, same-device replay, and another-device replay', async () => {
  await join(); const token = await issue();
  assert.equal((await claim(token)).member.points, 1);
  assert.equal((await claim(token)).member.points, 1);
  assert.equal((await api('claim', { ...payload, credential_hash: hash('other'), token_hash: token.token_hash })).error, 'ALREADY_USED');
  assert.equal((await db.query('select count(*)::int as n from loyalty_events')).rows[0].n, 1);
});
test('requests queued together cannot double-award a QR', async () => {
  await join(); const token = await issue();
  const results = await Promise.all([claim(token), claim(token), claim(token)]);
  assert.deepEqual(results.map(r => r.member.points), [1,1,1]);
});
test('expired and replaced QR codes award no points', async () => {
  await join(); const first = await issue(); const second = await issue();
  assert.equal((await claim(first)).error, 'EXPIRED');
  await db.query('update loyalty_tokens set expires_at=now()-interval \'1 second\' where id=$1', [second.id]);
  assert.equal((await claim(second)).error, 'EXPIRED');
  assert.equal((await api('view', payload)).member.points, 0);
});
test('staff cannot issue, search, or redeem for another café; inactive staff blocked', async () => {
  assert.equal((await issue({}, staffB)).error, 'FORBIDDEN');
  assert.equal((await issue({}, inactive)).error, 'FORBIDDEN');
  for (const action of ['search','inspect','redeem','history','status']) {
    assert.equal((await api(action, { cafe_id: cafeA, phone: '212612345678', token_hash: hash('code') }, staffB)).error, 'FORBIDDEN');
    assert.equal((await api(action, { slug: 'cafe-a' })).error, 'FORBIDDEN');
  }
});
test('same phone in different cafés has independent points and credentials', async () => {
  await join(); await points(1);
  const second = await join({ slug: 'cafe-b', credential_hash: hash('device-b') });
  assert.equal(second.member.points, 0);
  assert.equal((await api('view', { slug: 'cafe-b', credential_hash: device })).member, null);
  assert.equal((await api('claim', { slug: 'cafe-b', credential_hash: hash('device-b'), token_hash: (await issue()).token_hash })).error, 'INVALID_CODE');
});
test('reward requires enough points and can be redeemed exactly once, preserving surplus', async () => {
  await join();
  assert.equal((await api('reward_code', { ...payload, new_hash: hash('reward') })).error, 'NOT_ENOUGH_POINTS');
  await points(3);
  await api('reward_code', { ...payload, new_hash: hash('reward') });
  const request = { cafe_id: cafeA, token_hash: hash('reward') };
  assert.equal((await api('inspect', request, staffA)).points, 3);
  assert.equal((await api('redeem', request, staffA)).points, 1);
  assert.equal((await api('redeem', request, staffA)).error, 'ALREADY_USED');
});
test('changed reward invalidates an outstanding redemption code', async () => {
  await join(); await points(2); await api('reward_code', { ...payload, new_hash: hash('reward') });
  await db.query('update loyalty_programs set reward=$1 where cafe_id=$2', ['Une autre récompense', cafeA]);
  assert.equal((await api('redeem', { cafe_id: cafeA, token_hash: hash('reward') }, staffA)).error, 'PROGRAM_CHANGED');
  assert.equal((await api('view', payload)).member.points, 2);
});
test('recovery rotates device credential, keeps points, and revokes old reward codes', async () => {
  await join(); await points(2); await api('reward_code', { ...payload, new_hash: hash('reward') });
  const found = await api('search', { cafe_id: cafeA, phone: '212612345678' }, staffA);
  const token = await issue({ kind: 'recover', member_id: found.member.id });
  const result = await api('claim', { ...payload, credential_hash: hash('new-device'), token_hash: token.token_hash });
  assert.equal(result.member.points, 2);
  assert.equal((await api('view', payload)).member, null);
  assert.equal((await api('redeem', { cafe_id: cafeA, token_hash: hash('reward') }, staffA)).error, 'EXPIRED');
});
test('disabled and suspended cafés cannot award points', async () => {
  await join(); const token = await issue();
  await db.query('update loyalty_programs set enabled=false where cafe_id=$1', [cafeA]);
  assert.equal((await claim(token)).error, 'UNAVAILABLE');
  await db.query('update loyalty_programs set enabled=true where cafe_id=$1', [cafeA]);
  await db.query("update cafes set status='suspended' where id=$1", [cafeA]);
  assert.equal((await claim(token)).error, 'UNAVAILABLE');
});
test('no public/authenticated direct access to member data, balances or privileged RPC', async () => {
  for (const role of ['anon','authenticated']) {
    const result = await db.query(`select has_table_privilege($1,'public.loyalty_members','SELECT') as read, has_table_privilege($1,'public.loyalty_members','UPDATE') as write, has_function_privilege($1,'public.loyalty_action(text,jsonb,uuid,text)','EXECUTE') as execute`, [role]);
    assert.deepEqual(result.rows[0], { read: false, write: false, execute: false });
  }
});
test('rate limiting persists on rejected requests', async () => {
  for (let i=0;i<60;i++) await api('view', { slug: 'missing' });
  assert.equal((await api('view', payload)).error, 'RATE_LIMIT');
});
