import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, required, sha256 } from "../_shared/http.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { trackingToken } = await req.json();
    if (typeof trackingToken !== "string" || trackingToken.length < 32)
      return json({ error: "NOT_FOUND" }, 404);
    const client = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data, error } = await client.rpc("track_public_order_internal", {
      p_tracking_hash: await sha256(trackingToken),
    });
    if (error) throw error;
    return data ? json(data) : json({ error: "NOT_FOUND" }, 404);
  } catch (e) {
    console.error(
      JSON.stringify({
        function: "track-order",
        result: "error",
        message: (e as Error).message,
      }),
    );
    return json({ error: "NOT_FOUND" }, 404);
  }
});
