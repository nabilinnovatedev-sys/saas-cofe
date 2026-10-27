import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, hmac, json, required, sha256 } from '../_shared/http.ts';

const staffActions = new Set(['issue', 'status', 'search', 'inspect', 'redeem', 'history']);
const publicActions = new Set(['view', 'join', 'claim', 'reward_code']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secret = /^[0-9a-f]{64}$/;
const random = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(n => n.toString(16).padStart(2, '0')).join('');

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: 'INVALID_REQUEST' }, 400);
    let b: Record<string, unknown>;
    try { b = JSON.parse(raw); } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
    if (!b || typeof b !== 'object' || typeof b.action !== 'string') return json({ error: 'INVALID_REQUEST' }, 400);
    const action = b.action;
    if (!staffActions.has(action) && !publicActions.has(action)) return json({ error: 'INVALID_REQUEST' }, 400);
    const db = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    let actor: string | null = null;
    const data: Record<string, unknown> = {};
    if (staffActions.has(action)) {
      const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!bearer || typeof b.cafe_id !== 'string' || !uuid.test(b.cafe_id)) return json({ error: 'FORBIDDEN' }, 403);
      const { data: auth, error } = await db.auth.getUser(bearer);
      if (error || !auth.user) return json({ error: 'FORBIDDEN' }, 403);
      actor = auth.user.id;
      data.cafe_id = b.cafe_id;
    } else {
      if (typeof b.slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(b.slug)) return json({ error: 'INVALID_REQUEST' }, 400);
      data.slug = b.slug;
      if (b.credential !== undefined) {
        if (typeof b.credential !== 'string' || !secret.test(b.credential)) return json({ error: 'INVALID_REQUEST' }, 400);
        data.credential_hash = await sha256(b.credential);
      }
      if (action !== 'view' && !data.credential_hash) return json({ error: 'INVALID_REQUEST' }, 400);
    }
    if (action === 'join' || action === 'search') {
      if (typeof b.phone !== 'string' || !/^[1-9][0-9]{7,14}$/.test(b.phone)) return json({ error: 'INVALID_PHONE' }, 400);
      data.phone = b.phone;
    }
    if (action === 'join') {
      if (typeof b.name !== 'string' || b.name.trim().length < 1 || b.name.trim().length > 100) return json({ error: 'INVALID_NAME' }, 400);
      data.name = b.name.trim();
    }
    if (action === 'claim' || action === 'inspect' || action === 'redeem') {
      if (typeof b.token !== 'string' || !(action === 'claim' ? secret : /^[0-9a-f]{12}$/).test(b.token)) return json({ error: 'INVALID_CODE' }, 400);
      data.token_hash = await sha256(b.token);
    }
    let token: string | undefined;
    if (action === 'issue' || action === 'reward_code') {
      token = random(action === 'issue' ? 32 : 6);
      data.new_hash = await sha256(token);
    }
    if (action === 'issue') {
      if (b.kind !== 'award' && b.kind !== 'recover') return json({ error: 'INVALID_REQUEST' }, 400);
      data.kind = b.kind;
      if (b.kind === 'recover') {
        if (typeof b.member_id !== 'string' || !uuid.test(b.member_id)) return json({ error: 'INVALID_REQUEST' }, 400);
        data.member_id = b.member_id;
      }
    }
    if (action === 'status') {
      if (typeof b.id !== 'string' || !uuid.test(b.id)) return json({ error: 'INVALID_REQUEST' }, 400);
      data.id = b.id;
    }
    // Validate before issuing; never send grant tokens to third-party QR services.
    let origin: string | undefined;
    if (action === 'issue') {
      const url = new URL(required('PUBLIC_WEB_ORIGIN'));
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('ORIGIN');
      origin = url.origin;
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipHash = await hmac(required('ABUSE_HASH_SECRET'), `loyalty:${actor || ip}`);
    const { data: result, error } = await db.rpc('loyalty_action', { p_action: action, p_data: data, p_actor: actor, p_ip_hash: ipHash });
    if (error) {
      console.error('Loyalty database failure', error.code); // No names, phones, tokens or request bodies.
      return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
    }
    if (result?.error) return json(result, result.error === 'RATE_LIMIT' ? 429 : result.error === 'FORBIDDEN' ? 403 : 400);
    if (action === 'issue') return json({ ...result, url: `${origin}/fidelite/${result.slug}#${b.kind}=${token}` });
    if (action === 'reward_code') return json({ ...result, code: token });
    return json(result);
  } catch {
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
});
