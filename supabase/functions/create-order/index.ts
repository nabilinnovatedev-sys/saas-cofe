import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, hmac, json, required, sha256 } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json();
    const { slug, tableToken, idempotencyKey, items } = body;
    const fulfillment = body.fulfillmentType ?? "dine_in";
    if (
      typeof slug !== "string" ||
      !["dine_in", "delivery"].includes(fulfillment) ||
      (fulfillment === "dine_in" && typeof tableToken !== "string") ||
      typeof idempotencyKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey) ||
      !Array.isArray(items)
    )
      return json({ error: "INVALID_REQUEST" }, 400);
    if (fulfillment === "delivery") {
      if (typeof body.customerPhone !== "string" || !/^\+?[0-9]{8,15}$/.test(body.customerPhone.replace(/[\s().-]/g, "")))
        return json({ error: "INVALID_PHONE" }, 400);
      if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || Math.abs(body.latitude) > 90 || Math.abs(body.longitude) > 180)
        return json({ error: "LOCATION_REQUIRED" }, 400);
    }
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
      p_table_token: fulfillment === "dine_in" ? tableToken : null,
      p_items: items,
      p_order_note: body.orderNote || null,
      p_idempotency_key: idempotencyKey,
      p_tracking_hash: trackingHash,
      p_ip_hash: ipHash,
      p_fulfillment_type: fulfillment,
      p_customer_phone: fulfillment === "delivery" ? body.customerPhone : null,
      p_delivery_latitude: fulfillment === "delivery" ? body.latitude : null,
      p_delivery_longitude: fulfillment === "delivery" ? body.longitude : null,
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
