import { createClient } from "npm:@supabase/supabase-js@2";
import { json, required } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-secret") !== required("PUSH_WORKER_SECRET"))
    return json({ error: "NOT_FOUND" }, 404);
  const db = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: tickets, error } = await db.rpc("claim_push_tickets", {
    p_limit: 300,
  });
  if (error) return json({ error: "TICKET_READ_FAILED" }, 500);
  if (!tickets?.length) return json({ checked: 0 });
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ids: tickets.map((ticket: any) => ticket.ticket_id),
    }),
  });
  if (!response.ok) return json({ error: "EXPO_RECEIPTS_FAILED" }, 502);
  const payload = await response.json();
  let checked = 0;
  for (const ticket of tickets) {
    const receipt = payload.data?.[ticket.ticket_id];
    if (!receipt) continue;
    const errorCode = receipt.details?.error || null;
    await db
      .from("push_delivery_tickets")
      .update({
        status: receipt.status === "ok" ? "ok" : "error",
        error_code: errorCode,
        checked_at: new Date().toISOString(),
      })
      .eq("ticket_id", ticket.ticket_id);
    if (errorCode === "DeviceNotRegistered")
      await db
        .from("device_push_tokens")
        .update({ active: false })
        .eq("id", ticket.device_token_id);
    checked++;
  }
  return json({ checked });
});
