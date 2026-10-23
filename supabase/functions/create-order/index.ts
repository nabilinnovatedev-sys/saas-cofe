import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, hmac, json, required, sha256 } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json();
    const { slug, tableToken, idempotencyKey, items } = body;
    if (
      typeof slug !== "string" ||
      typeof tableToken !== "string" ||
      typeof idempotencyKey !== "string" ||
      !Array.isArray(items)
    )
      return json({ error: "INVALID_REQUEST" }, 400);
    const trackingToken = await hmac(
      required("TRACKING_SECRET"),
      `${slug}:${idempotencyKey}`,
    );
    const trackingHash = await sha256(trackingToken);
    const forwarded =
      req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ipHash = await hmac(required("ABUSE_HASH_SECRET"), forwarded.trim());
    const admin = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data, error } = await admin.rpc("create_public_order_internal", {
      p_slug: slug,
      p_table_token: tableToken,
      p_items: items,
      p_order_note: body.orderNote || null,
      p_idempotency_key: idempotencyKey,
      p_tracking_hash: trackingHash,
      p_ip_hash: ipHash,
    });
    if (error) throw error;
    if (data?.error)
      return json(
        data,
        data.error === "RATE_LIMITED"
          ? 429
          : data.error === "CART_CHANGED"
            ? 409
            : 400,
      );
    return json(
      { ...data, tracking_token: trackingToken },
      data?.idempotent ? 200 : 201,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        function: "create-order",
        result: "error",
        message: (error as Error).message,
      }),
    );
    return json({ error: "ORDER_CREATION_FAILED" }, 500);
  }
});
