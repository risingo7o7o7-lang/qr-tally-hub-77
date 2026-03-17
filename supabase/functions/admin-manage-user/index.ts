import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables for admin-manage-user function.");
}

type AppRole =
  | "student"
  | "teacher"
  | "coordinator"
  | "head_coordinator"
  | "module_coordinator"
  | "college_admin"
  | "super_admin";

type JwtUser = { sub: string };

function getIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

async function getUserFromAuthHeader(req: Request): Promise<JwtUser | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  try {
    const [, payloadB64] = token.split(".");
    const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

function stripFormulaPrefix(value: string) {
  if (!value) return value;
  const trimmed = value.trimStart();
  if (/^[=+\-@]/.test(trimmed)) {
    return trimmed.replace(/^[=+\-@]+/, "");
  }
  return value;
}

function randomInt(max: number) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function generatePassword(): string {
  const adjectives = ["Bright", "Calm", "Clever", "Daring", "Eager", "Gentle", "Happy", "Kind", "Lucky", "Mighty"];
  const nouns = ["Falcon", "River", "Mountain", "Forest", "Lion", "Tiger", "Eagle", "Comet", "Harbor", "Nova"];
  const adj = adjectives[randomInt(adjectives.length)];
  const noun = nouns[randomInt(nouns.length)];
  const num = randomInt(1000).toString().padStart(3, "0");
  return `${adj}${noun}${num}`;
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rateLimitCaller(
  supabaseService: ReturnType<typeof createClient>,
  callerId: string,
  ip: string | null,
) {
  const windowSeconds = 60;
  const maxRequests = 10;
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const q = supabaseService
    .from("audit_logs")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", callerId)
    .eq("action", "admin_manage_user")
    .gte("created_at", since);

  const { count, error } = await q;
  if (error) throw new Error("rate_limit_check_failed");

  if ((count ?? 0) >= maxRequests) throw new Error("rate_limited");

  // Optional IP dimension (defensive)
  if (ip) {
    const { count: ipCount, error: ipError } = await supabaseService
      .from("audit_logs")
      .select("id", { head: true, count: "exact" })
      .eq("ip_address", ip)
      .eq("action", "admin_manage_user")
      .gte("created_at", since);
    if (ipError) throw new Error("rate_limit_check_failed");
    if ((ipCount ?? 0) >= 50) throw new Error("rate_limited");
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const caller = await getUserFromAuthHeader(req);
  if (!caller?.sub) return new Response("Unauthorized", { status: 401 });

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const ip = getIp(req);

  // AuthZ: must be college_admin or super_admin, OR module_coordinator for create_user only
  const { data: callerRoles, error: rolesError } = await supabaseAuthed
    .from("user_roles")
    .select("role, college_id")
    .eq("user_id", caller.sub);

  if (rolesError) return new Response("Failed to load roles", { status: 500 });

  const has = (r: AppRole) => (callerRoles ?? []).some((x) => x.role === r);
  const isAdmin = has("college_admin") || has("super_admin");
  const isModuleCoord = has("module_coordinator");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const action = body.action as
    | "create_user"
    | "delete_user"
    | "reset_password"
    | "change_role"
    | "bulk_import";

  if (!action) return new Response("action is required", { status: 400 });

  if (!isAdmin && !(isModuleCoord && action === "create_user")) {
    return new Response("Forbidden", { status: 403 });
  }

  // Rate limit per caller
  try {
    await rateLimitCaller(supabaseService, caller.sub, ip);
  } catch (e) {
    if ((e as Error).message === "rate_limited") {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Rate limit check failed", { status: 500 });
  }

  // Helper: log invocation (service role so it always succeeds; never allow client insert via RLS)
  const logInvocation = async (details: Record<string, unknown>) => {
    await supabaseService.from("audit_logs").insert({
      user_id: caller.sub,
      college_id: details.college_id ?? (callerRoles?.[0]?.college_id ?? "buc"),
      action: "admin_manage_user",
      event_type: "admin",
      ip_address: ip,
      details,
    });
  };

  const defaultCollegeId = body.college_id ?? (callerRoles?.[0]?.college_id ?? "buc");
  const defaultSemesterId = body.semester_id ?? "2025-2026-S2";

  if (action === "create_user") {
    const email = stripFormulaPrefix(String(body.email ?? "")).trim();
    const name = stripFormulaPrefix(String(body.name ?? "")).trim();
    const role = body.role as AppRole;
    const student_id = body.student_id ? stripFormulaPrefix(String(body.student_id)).trim() : undefined;
    const college_id = String(body.college_id ?? defaultCollegeId);
    const semester_id = String(body.semester_id ?? defaultSemesterId);

    if (!email || !role) return new Response("email and role are required", { status: 400 });

    // module_coordinator can only create teacher users
    if (isModuleCoord && !isAdmin && role !== "teacher") {
      return new Response("Forbidden", { status: 403 });
    }

    const password = body.password ? String(body.password) : generatePassword();

    const { data: created, error: createError } = await supabaseService.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, student_id, college_id, semester_id },
    });

    if (createError || !created?.user) {
      console.error("createUser failed", createError);
      return new Response("Failed to create user", { status: 500 });
    }

    // Ensure role row exists
    await supabaseService.from("user_roles").insert({
      user_id: created.user.id,
      role,
      college_id,
    });

    // If module coordinator created a teacher, insert managed_teachers row
    if (role === "teacher" && isModuleCoord && !isAdmin) {
      const passwordHash = await sha256Hex(password);
      await supabaseService.from("managed_teachers").insert({
        teacher_user_id: created.user.id,
        created_by: caller.sub,
        college_id,
        semester_id,
        current_password_hash: passwordHash,
        current_password_plain: password,
      });
    }

    await logInvocation({ action, created_user_id: created.user.id, role, college_id });
    return new Response(
      JSON.stringify({ status: "ok", user_id: created.user.id, password }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (action === "delete_user") {
    const user_id = String(body.user_id ?? "");
    if (!user_id) return new Response("user_id is required", { status: 400 });

    const { error } = await supabaseService.auth.admin.deleteUser(user_id);
    if (error) return new Response("Failed to delete user", { status: 500 });

    await logInvocation({ action, user_id });
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "reset_password") {
    const user_id = String(body.user_id ?? "");
    if (!user_id) return new Response("user_id is required", { status: 400 });
    const password = body.password ? String(body.password) : generatePassword();

    const { error } = await supabaseService.auth.admin.updateUserById(user_id, { password });
    if (error) return new Response("Failed to reset password", { status: 500 });

    await logInvocation({ action, user_id });
    return new Response(JSON.stringify({ status: "ok", password }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "change_role") {
    const user_id = String(body.user_id ?? "");
    const role = body.role as AppRole;
    const college_id = String(body.college_id ?? defaultCollegeId);
    if (!user_id || !role) return new Response("user_id and role are required", { status: 400 });

    // Ensure single role per college: delete existing roles for that college, then insert new
    await supabaseService.from("user_roles").delete().eq("user_id", user_id).eq("college_id", college_id);
    await supabaseService.from("user_roles").insert({ user_id, role, college_id });

    // Log role changes to audit_logs via service role
    await supabaseService.from("audit_logs").insert({
      user_id: caller.sub,
      college_id,
      action: "change_role",
      event_type: "admin",
      ip_address: ip,
      details: { target_user_id: user_id, new_role: role },
    });

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "bulk_import") {
    // Expect an array of users: [{email,name,role,student_id,college_id,semester_id}, ...]
    const users = Array.isArray(body.users) ? body.users : null;
    if (!users) return new Response("users[] is required", { status: 400 });

    const results: Array<{ email: string; status: string; user_id?: string; error?: string }> = [];

    for (const raw of users) {
      const email = stripFormulaPrefix(String(raw.email ?? "")).trim();
      const name = stripFormulaPrefix(String(raw.name ?? "")).trim();
      const role = raw.role as AppRole;
      const student_id = raw.student_id ? stripFormulaPrefix(String(raw.student_id)).trim() : undefined;
      const college_id = stripFormulaPrefix(String(raw.college_id ?? defaultCollegeId)).trim() || defaultCollegeId;
      const semester_id = stripFormulaPrefix(String(raw.semester_id ?? defaultSemesterId)).trim() || defaultSemesterId;

      if (!email || !role) {
        results.push({ email, status: "error", error: "missing_email_or_role" });
        continue;
      }

      try {
        const password = generatePassword();
        const { data: created, error: createError } = await supabaseService.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, student_id, college_id, semester_id },
        });

        if (createError || !created?.user) {
          results.push({ email, status: "error", error: "create_failed" });
          continue;
        }

        await supabaseService.from("user_roles").insert({ user_id: created.user.id, role, college_id });
        results.push({ email, status: "ok", user_id: created.user.id });
      } catch (_e) {
        results.push({ email, status: "error", error: "exception" });
      }
    }

    await logInvocation({ action, imported_count: results.filter((r) => r.status === "ok").length });
    return new Response(JSON.stringify({ status: "ok", results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Unknown action", { status: 400 });
}

serve(handler);

