import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, required } from "../_shared/http.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.headers.get("x-bootstrap-secret") !== required("BOOTSTRAP_SECRET"))
      return json({ error: "NOT_FOUND" }, 404);
    const body = await req.json();
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.password.length < 12
    )
      return json({ error: "INVALID_INPUT" }, 400);
    const admin = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { count } = await admin
      .from("staff_profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "platform_admin");
    if (count) return json({ error: "ADMIN_ALREADY_EXISTS" }, 409);
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (error) throw error;
    const { error: pe } = await admin.from("staff_profiles").insert({
      user_id: data.user.id,
      role: "platform_admin",
      active: true,
      display_name: body.displayName || "Administrateur",
    });
    if (pe) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw pe;
    }
    return json({ ok: true }, 201);
  } catch (e) {
    console.error(
      JSON.stringify({
        function: "bootstrap-admin",
        result: "error",
        message: (e as Error).message,
      }),
    );
    return json({ error: "BOOTSTRAP_FAILED" }, 500);
  }
});
