import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, required } from "../_shared/http.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const bearer = req.headers.get("authorization");
    if (!bearer) return json({ error: "UNAUTHORIZED" }, 401);
    const url = required("SUPABASE_URL"),
      anon = required("SUPABASE_ANON_KEY");
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "UNAUTHORIZED" }, 401);
    const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data: profile } = await admin
      .from("staff_profiles")
      .select("role,active")
      .eq("user_id", user.id)
      .single();
    if (profile?.role !== "platform_admin" || !profile.active)
      return json({ error: "FORBIDDEN" }, 403);
    const body = await req.json();
    if (body.action === "create") {
      if (
        typeof body.email !== "string" ||
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        typeof body.display_name !== "string" ||
        !body.display_name.trim() ||
        typeof body.cafeId !== "string"
      )
        return json({ error: "INVALID_STAFF_DATA" }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email.trim().toLowerCase(),
        password: body.password,
        email_confirm: true,
        user_metadata: { display_name: body.display_name.trim() },
      });
      if (error) throw error;
      const created = data.user;
      const { error: pe } = await admin.from("staff_profiles").insert({
        user_id: created.id,
        cafe_id: body.cafeId,
        role: "waiter",
        active: true,
        display_name: body.display_name.trim(),
        can_manage_categories: body.can_manage_categories === true,
        can_manage_products: body.can_manage_products === true,
      });
      if (pe) {
        await admin.auth.admin.deleteUser(created.id);
        throw pe;
      }
      await admin.from("audit_events").insert({
        cafe_id: body.cafeId,
        actor_user_id: user.id,
        action: "waiter.created",
        target_type: "staff_profile",
        target_id: created.id,
        metadata: {
          can_manage_categories: body.can_manage_categories === true,
          can_manage_products: body.can_manage_products === true,
        },
      });
      return json({ ok: true }, 201);
    }
    if (body.action === "invite") {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(
        body.email,
        {
          redirectTo: `${Deno.env.get("WAITER_APP_REDIRECT") || "cafe-waiter://auth"}`,
          data: { display_name: body.display_name },
        },
      );
      if (error) throw error;
      const created = data.user;
      const { error: pe } = await admin.from("staff_profiles").insert({
        user_id: created.id,
        cafe_id: body.cafeId,
        role: "waiter",
        active: true,
        display_name: body.display_name,
      });
      if (pe) {
        await admin.auth.admin.deleteUser(created.id);
        throw pe;
      }
      await admin.from("audit_events").insert({
        cafe_id: body.cafeId,
        actor_user_id: user.id,
        action: "waiter.invited",
        target_type: "staff_profile",
        target_id: created.id,
      });
      return json({ ok: true }, 201);
    }
    const { data: target } = await admin
      .from("staff_profiles")
      .select("user_id,role,cafe_id")
      .eq("user_id", body.userId)
      .single();
    if (target?.role !== "waiter")
      return json({ error: "WAITER_NOT_FOUND" }, 404);
    if (body.action === "permissions") {
      const permissions = {
        can_manage_categories: body.can_manage_categories === true,
        can_manage_products: body.can_manage_products === true,
      };
      const { error } = await admin
        .from("staff_profiles")
        .update(permissions)
        .eq("user_id", body.userId);
      if (error) throw error;
      await admin.from("audit_events").insert({
        cafe_id: target.cafe_id,
        actor_user_id: user.id,
        action: "waiter.permissions_updated",
        target_type: "staff_profile",
        target_id: body.userId,
        metadata: permissions,
      });
      return json({ ok: true });
    }
    if (body.action === "disable") {
      await admin
        .from("staff_profiles")
        .update({ active: false })
        .eq("user_id", body.userId);
      await admin
        .from("device_push_tokens")
        .update({ active: false })
        .eq("user_id", body.userId);
      await admin.auth.admin.updateUserById(body.userId, {
        ban_duration: "876000h",
      });
      await admin.from("audit_events").insert({
        cafe_id: target.cafe_id,
        actor_user_id: user.id,
        action: "waiter.disabled",
        target_type: "staff_profile",
        target_id: body.userId,
      });
      return json({ ok: true });
    }
    if (body.action === "enable") {
      await admin.auth.admin.updateUserById(body.userId, {
        ban_duration: "none",
      });
      await admin
        .from("staff_profiles")
        .update({ active: true })
        .eq("user_id", body.userId);
      await admin.from("audit_events").insert({
        cafe_id: target.cafe_id,
        actor_user_id: user.id,
        action: "waiter.enabled",
        target_type: "staff_profile",
        target_id: body.userId,
      });
      return json({ ok: true });
    }
    if (body.action === "reset") {
      const { data: u } = await admin.auth.admin.getUserById(body.userId);
      if (!u.user?.email) return json({ error: "WAITER_NOT_FOUND" }, 404);
      const publicClient = createClient(url, anon);
      const { error } = await publicClient.auth.resetPasswordForEmail(
        u.user.email,
        {
          redirectTo:
            Deno.env.get("WAITER_APP_REDIRECT") || "cafe-waiter://auth",
        },
      );
      if (error) throw error;
      await admin.from("audit_events").insert({
        cafe_id: target.cafe_id,
        actor_user_id: user.id,
        action: "waiter.password_reset_requested",
        target_type: "staff_profile",
        target_id: body.userId,
      });
      return json({ ok: true });
    }
    return json({ error: "INVALID_ACTION" }, 400);
  } catch (e) {
    const message = (e as Error & { code?: string }).message || "";
    const code = (e as Error & { code?: string }).code || "";
    console.error(
      JSON.stringify({
        function: "admin-staff",
        result: "error",
        message,
        code,
      }),
    );
    if (
      code === "email_exists" ||
      message.toLowerCase().includes("already been registered") ||
      message.toLowerCase().includes("already registered")
    )
      return json({ error: "EMAIL_ALREADY_EXISTS" }, 409);
    return json({ error: "STAFF_OPERATION_FAILED" }, 500);
  }
});
