import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables for end-session function.");
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

  // Verify ownership and current status
  const { data: session, error: sessionError } = await supabaseClient
    .from("attendance_sessions")
    .select("id, teacher_id, status, college_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return new Response("Session not found", { status: 404 });
  }

  if (session.teacher_id !== user.sub) {
    return new Response("Forbidden", { status: 403 });
  }

  if (session.status === "ended") {
    return new Response(
      JSON.stringify({ status: "already_ended", session_id: session.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabaseService
    .from("attendance_sessions")
    .update({
      status: "ended",
      end_time: now,
    })
    .eq("id", session.id);

  if (updateError) {
    console.error("Failed to end session", updateError);
    return new Response("Failed to end session", { status: 500 });
  }

  const { error: logError } = await supabaseService.from("audit_logs").insert({
    user_id: user.sub,
    college_id: session.college_id,
    action: "end_session",
    event_type: "attendance",
    session_id: session.id,
    details: { reason: "explicit_end" },
  });

  if (logError) {
    console.error("Failed to log end_session", logError);
  }

  return new Response(
    JSON.stringify({
      status: "ended",
      session_id: session.id,
      ended_at: now,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

serve(handler);

