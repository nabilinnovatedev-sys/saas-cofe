import { createClient } from "npm:@supabase/supabase-js@2";
import { json, required } from "../_shared/http.ts";
const b64ToBytes = (v: string) =>
  Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
async function decrypt(value: string) {
  const [iv64, data64] = value.split(":");
  const key = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(required("DEVICE_ENCRYPTION_KEY")),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(iv64) },
    key,
    b64ToBytes(data64),
  );
  return new TextDecoder().decode(raw);
}
Deno.serve(async (req) => {
  if (req.headers.get("x-worker-secret") !== required("PUSH_WORKER_SECRET"))
    return json({ error: "NOT_FOUND" }, 404);
  const db = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: events, error } = await db.rpc("claim_notification_outbox", {
    p_limit: 50,
  });
  if (error) return json({ error: "OUTBOX_READ_FAILED" }, 500);
  let sent = 0;
  for (const event of events || []) {
    try {
      const { data: tokens } = await db
        .from("device_push_tokens")
        .select("*")
        .eq("cafe_id", event.cafe_id)
        .eq("active", true);
      if (tokens?.length) {
        const messages = await Promise.all(
          tokens.map(async (t) => ({
            to: await decrypt(t.token_ciphertext),
            sound: "default",
            title: "Nouvelle commande",
            body: "Une nouvelle commande attend votre attention.",
            data: { orderId: event.order_id },
            priority: "high",
            channelId: "orders",
          })),
        );
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(messages),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`Expo ${response.status}`);
        for (let i = 0; i < (result.data || []).length; i++) {
          const ticket = result.data[i];
          if (ticket?.id)
            await db.from("push_delivery_tickets").upsert({
              ticket_id: ticket.id,
              device_token_id: tokens[i].id,
              outbox_id: event.id,
              status: "pending",
            });
          if (ticket?.details?.error === "DeviceNotRegistered")
            await db
              .from("device_push_tokens")
              .update({ active: false })
              .eq("id", tokens[i].id);
        }
        sent += messages.length;
      }
      await db
        .from("notification_outbox")
        .update({ processed_at: new Date().toISOString(), last_error: null })
        .eq("id", event.id);
    } catch (e) {
      await db
        .from("notification_outbox")
        .update({
          last_error: String((e as Error).message).slice(0, 300),
          claimed_at: null,
          available_at: new Date(
            Date.now() + 60000 * Math.min(30, 2 ** (event.attempts + 1)),
          ).toISOString(),
        })
        .eq("id", event.id);
    }
  }
  return json({ events: events?.length || 0, sent });
});
