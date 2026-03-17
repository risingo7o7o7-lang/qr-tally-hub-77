import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QR_SIGNING_SECRET = Deno.env.get("QR_SIGNING_SECRET")!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !QR_SIGNING_SECRET) {
  console.error("Missing required environment variables for submit-attendance function.");
}

type JwtUser = {
  sub: string;
};

async function getUserFromAuthHeader(req: Request): Promise<JwtUser | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  try {
    const [, payloadB64] = token.split(".");
    const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    return { sub: payload.sub };
  } catch (_e) {
    return null;
  }
}

async function rateLimitSubmit(
  supabaseService: ReturnType<typeof createClient>,
  userId: string,
  ipAddress: string | null,
) {
  const windowSeconds = 10;

  // Per-user: 5 per 10 seconds
  const { count: userCount, error: userError } = await supabaseService
    .from("audit_logs")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("action", "submit_attendance")
    .gte("created_at", new Date(Date.now() - windowSeconds * 1000).toISOString());

  if (userError) {
    console.error("User rate limit check failed", userError);
    throw new Error("rate_limit_check_failed");
  }

  if ((userCount ?? 0) >= 5) {
    throw new Error("rate_limited_user");
  }

  // Per-IP: 20 per 10 seconds
  if (ipAddress) {
    const { count: ipCount, error: ipError } = await supabaseService
      .from("audit_logs")
      .select("id", { head: true, count: "exact" })
      .eq("ip_address", ipAddress)
      .eq("action", "submit_attendance")
      .gte("created_at", new Date(Date.now() - windowSeconds * 1000).toISOString());

    if (ipError) {
      console.error("IP rate limit check failed", ipError);
      throw new Error("rate_limit_check_failed");
    }

    if ((ipCount ?? 0) >= 20) {
      throw new Error("rate_limited_ip");
    }
  }
}

async function verifyQrToken(token: string) {
  const parts = token.split("|");
  if (parts.length !== 4) {
    throw new Error("invalid_token_format");
  }

  const [sessionId, issuedAt, expiresAt, signature] = parts;
  const payloadBase = `${sessionId}|${issuedAt}|${expiresAt}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(QR_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedSigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadBase),
  );
  const expectedBytes = new Uint8Array(expectedSigBuf);
  const expectedHex = Array.from(expectedBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedHex !== signature) {
    throw new Error("invalid_signature");
  }

  return {
    sessionId,
    issuedAt: new Date(issuedAt),
    expiresAt: new Date(expiresAt),
  };
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ipAddress =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    null;

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
      },
    },
  });

  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { qr_token?: string; device_fingerprint?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const qrToken = body.qr_token;
  const deviceFingerprint = body.device_fingerprint ?? null;

  if (!qrToken) {
    return new Response("qr_token is required", { status: 400 });
  }

  // Rate limit checks first
  try {
    await rateLimitSubmit(supabaseService, user.sub, ipAddress);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "rate_limited_user" || msg === "rate_limited_ip") {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Rate limit check failed", { status: 500 });
  }

  // Validate QR token signature and expiry
  let decoded;
  try {
    decoded = await verifyQrToken(qrToken);
  } catch (e) {
    const msg = (e as Error).message;
    const allowed = new Set(["invalid_token_format", "invalid_signature"]);
    return new Response(JSON.stringify({ error: allowed.has(msg) ? msg : "invalid_qr_token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();

  // Reject tokens issued in the future (clock skew / replay hardening)
  if (decoded.issuedAt.getTime() > now.getTime() + 5_000) {
    return new Response(JSON.stringify({ error: "issued_at_in_future" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2-minute expiry window
  const windowMillis = 2 * 60 * 1000;
  if (now.getTime() > decoded.expiresAt.getTime() + windowMillis) {
    return new Response(
      JSON.stringify({ error: "qr_token_expired", expires_at: decoded.expiresAt.toISOString() }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Check session is active and within duration + grace
  const { data: session, error: sessionError } = await supabaseClient
    .from("attendance_sessions")
    .select("id, status, start_time, duration_minutes, grace_period_minutes, college_id, semester_id")
    .eq("id", decoded.sessionId)
    .single();

  if (sessionError || !session) {
    return new Response("Session not found", { status: 404 });
  }

  if (session.status !== "active") {
    return new Response("Session is not active", { status: 400 });
  }

  const startTime = new Date(session.start_time);
  const durationMillis = (session.duration_minutes ?? 0) * 60 * 1000;
  const graceMillis = (session.grace_period_minutes ?? 0) * 60 * 1000;

  if (now.getTime() > startTime.getTime() + durationMillis + graceMillis) {
    return new Response(JSON.stringify({ error: "session_ended" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check idempotency: existing record
  const { data: existingRecord, error: existingError } = await supabaseClient
    .from("attendance_records")
    .select("id, status, submitted_at")
    .eq("session_id", session.id)
    .eq("student_id", user.sub)
    .maybeSingle();

  if (existingError) {
    console.error("Failed to check existing attendance record", existingError);
    return new Response("Failed to check attendance", { status: 500 });
  }

  if (existingRecord) {
    return new Response(
      JSON.stringify({
        status: "already_recorded",
        record_id: existingRecord.id,
        submitted_at: existingRecord.submitted_at,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Check / bind device
  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("device_hash, device_bound, college_id, semester_id")
    .eq("user_id", user.sub)
    .single();

  if (profileError || !profile) {
    console.error("Failed to load profile for device check", profileError);
    return new Response("Profile not found", { status: 400 });
  }

  let attendanceStatus: "present" | "suspicious" = "present";

  if (profile.device_bound) {
    if (deviceFingerprint && profile.device_hash && deviceFingerprint !== profile.device_hash) {
      attendanceStatus = "suspicious";
    }
  } else if (deviceFingerprint) {
    const { error: bindError } = await supabaseService
      .from("profiles")
      .update({
        device_hash: deviceFingerprint,
        device_bound: true,
      })
      .eq("user_id", user.sub);

    if (bindError) {
      console.error("Failed to bind device", bindError);
      // Do not block attendance on binding failure; proceed.
    }
  }

  // Insert attendance record
  const { data: inserted, error: insertError } = await supabaseClient
    .from("attendance_records")
    .insert({
      session_id: session.id,
      student_id: user.sub,
      college_id: session.college_id ?? profile.college_id,
      semester_id: session.semester_id ?? profile.semester_id,
      device_fingerprint: deviceFingerprint,
      status: attendanceStatus,
    })
    .select("id, submitted_at, status")
    .single();

  if (insertError) {
    // Race-safe idempotency: unique constraint hit means it's already recorded
    const code = (insertError as any)?.code;
    if (code === "23505") {
      return new Response(JSON.stringify({ status: "already_recorded" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Failed to insert attendance record", insertError);
    return new Response("Failed to record attendance", { status: 500 });
  }

  // Audit log via service role
  const { error: logError } = await supabaseService.from("audit_logs").insert({
    user_id: user.sub,
    college_id: session.college_id ?? profile.college_id,
    action: "submit_attendance",
    event_type: "attendance",
    session_id: session.id,
    device_hash: deviceFingerprint,
    ip_address: ipAddress,
    details: {
      status: inserted.status,
    },
    metadata: {
      qr_issued_at: decoded.issuedAt.toISOString(),
      qr_expires_at: decoded.expiresAt.toISOString(),
    },
  });

  if (logError) {
    console.error("Failed to log attendance audit", logError);
  }

  return new Response(
    JSON.stringify({
      status: "recorded",
      record_id: inserted.id,
      submitted_at: inserted.submitted_at,
      attendance_status: inserted.status,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

serve(handler);

