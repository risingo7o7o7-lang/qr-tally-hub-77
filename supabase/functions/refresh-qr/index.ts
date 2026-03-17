import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QR_SIGNING_SECRET = Deno.env.get("QR_SIGNING_SECRET")!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !QR_SIGNING_SECRET) {
  console.error("Missing required environment variables for refresh-qr function.");
}

type JwtUser = {
  sub: string;
};

async function getUserFromAuthHeader(req: Request): Promise<JwtUser | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  // Minimal JWT decode without verification (Supabase already verified before invoking edge function)
  try {
    const [, payloadB64] = token.split(".");
    const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    return { sub: payload.sub };
  } catch (_e) {
    return null;
  }
}

async function rateLimitTeacher(supabaseService: ReturnType<typeof createClient>, userId: string) {
  const windowSeconds = 30;
  const maxRequests = 5;

  const { count, error } = await supabaseService
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "refresh_qr")
    .gte("created_at", new Date(Date.now() - windowSeconds * 1000).toISOString());

  if (error) {
    console.error("Rate limit check failed", error);
    throw new Error("rate_limit_check_failed");
  }

  if ((count ?? 0) >= maxRequests) {
    throw new Error("rate_limited");
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
      },
    },
  });

  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { session_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const sessionId = body.session_id;
  if (!sessionId) {
    return new Response("session_id is required", { status: 400 });
  }

  // Verify that the session belongs to this teacher and is active
  const { data: session, error: sessionError } = await supabaseClient
    .from("attendance_sessions")
    .select("id, teacher_id, status, duration_minutes, start_time, grace_period_minutes, college_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return new Response("Session not found", { status: 404 });
  }

  if (session.teacher_id !== user.sub) {
    return new Response("Forbidden", { status: 403 });
  }

  if (session.status !== "active") {
    return new Response("Session is not active", { status: 400 });
  }

  // Rate limit: 5 requests per 30 seconds per user (teacher)
  try {
    await rateLimitTeacher(supabaseService, user.sub);
  } catch (e) {
    if ((e as Error).message === "rate_limited") {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Rate limit check failed", { status: 500 });
  }

  const now = new Date();
  const issuedAt = now.toISOString();

  const expiresAtDate = new Date(now.getTime() + session.refresh_interval * 1000);
  const expiresAt = expiresAtDate.toISOString();

  const payloadBase = `${sessionId}|${issuedAt}|${expiresAt}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(QR_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadBase),
  );
  const signatureBytes = new Uint8Array(signatureBuffer);
  const signatureHex = Array.from(signatureBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const token = `${payloadBase}|${signatureHex}`;

  // Persist current token and expiry on the session
  const { error: updateError } = await supabaseService
    .from("attendance_sessions")
    .update({
      current_qr_token: token,
      qr_token_expires_at: expiresAt,
    })
    .eq("id", sessionId);

  if (updateError) {
    console.error("Failed to update session with QR token", updateError);
    return new Response("Failed to refresh QR", { status: 500 });
  }

  // Log audit event
  const { error: logError } = await supabaseService.from("audit_logs").insert({
    user_id: user.sub,
    college_id: session.college_id,
    action: "refresh_qr",
    event_type: "attendance",
    session_id: sessionId,
    details: { reason: "qr_refreshed" },
  });

  if (logError) {
    console.error("Failed to log refresh_qr audit", logError);
  }

  return new Response(JSON.stringify({ token, session_id: sessionId, issued_at: issuedAt, expires_at: expiresAt }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

serve(handler);

