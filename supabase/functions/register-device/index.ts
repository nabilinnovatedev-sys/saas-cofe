import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, required, sha256 } from "../_shared/http.ts";
const bytesToB64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
async function encrypt(value: string) {
  const raw = Uint8Array.from(atob(required("DEVICE_ENCRYPTION_KEY")), (c) =>
    c.charCodeAt(0),
  );
  if (raw.length !== 32)
    throw new Error("DEVICE_ENCRYPTION_KEY must contain 32 bytes");
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `${bytesToB64(iv)}:${bytesToB64(new Uint8Array(encrypted))}`;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const bearer = req.headers.get("authorization");
    if (!bearer) return json({ error: "UNAUTHORIZED" }, 401);
    const url = required("SUPABASE_URL");
    const userClient = createClient(url, required("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: bearer } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "UNAUTHORIZED" }, 401);
    const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: p } = await admin
      .from("staff_profiles")
      .select("cafe_id,role,active")
      .eq("user_id", user.id)
      .single();
    if (!p?.active || p.role !== "waiter")
      return json({ error: "FORBIDDEN" }, 403);
    const { token, platform } = await req.json();
    if (typeof token !== "string" || !["ios", "android"].includes(platform))
      return json({ error: "INVALID_INPUT" }, 400);
    const tokenHash = await sha256(token);
    const { error } = await admin.from("device_push_tokens").upsert(
      {
        user_id: user.id,
        cafe_id: p.cafe_id,
        platform,
        token_hash: tokenHash,
        token_ciphertext: await encrypt(token),
        active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token_hash" },
    );
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    console.error(
      JSON.stringify({
        function: "register-device",
        result: "error",
        message: (e as Error).message,
      }),
    );
    return json({ error: "REGISTRATION_FAILED" }, 500);
  }
});
