import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
  console.error("Missing required environment variables for close-expired-sessions function.");
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const cronHeader = req.headers.get("x-cron-secret");
  if (!cronHeader || cronHeader !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = new Date();
  const nowIso = now.toISOString();

  // Close sessions where duration + grace has elapsed or explicit end_time passed
  const { data: sessions, error: fetchError } = await supabaseService
    .from("attendance_sessions")
    .select("id, status, start_time, duration_minutes, grace_period_minutes, end_time, college_id, semester_id")
    .eq("status", "active");

  if (fetchError) {
    console.error("Failed to fetch active sessions", fetchError);
    await supabaseService.from("cron_health").upsert({
      job_name: "close_expired_sessions",
      last_run_at: nowIso,
      last_status: "error",
      status: "error",
      college_id: "buc",
      semester_id: "2025-2026-S2",
      details: { message: "fetch_failed" },
    });
    return new Response("Failed to fetch active sessions", { status: 500 });
  }

  const toClose = (sessions ?? []).filter((s) => {
    const startTime = new Date(s.start_time);
    const durationMillis = (s.duration_minutes ?? 0) * 60 * 1000;
    const graceMillis = (s.grace_period_minutes ?? 0) * 60 * 1000;

    if (s.end_time) {
      return new Date(s.end_time).getTime() < now.getTime();
    }

    return now.getTime() > startTime.getTime() + durationMillis + graceMillis;
  });

  const closedIds: string[] = [];

  for (const session of toClose) {
    const { error: updateError } = await supabaseService
      .from("attendance_sessions")
      .update({
        status: "ended",
        end_time: session.end_time ?? nowIso,
      })
      .eq("id", session.id);

    if (updateError) {
      console.error("Failed to close session", session.id, updateError);
      continue;
    }

    closedIds.push(session.id);

    const { error: logError } = await supabaseService.from("audit_logs").insert({
      user_id: null,
      college_id: session.college_id,
      semester_id: session.semester_id,
      action: "close_expired_session",
      event_type: "attendance",
      session_id: session.id,
      details: { reason: "cron_expired" },
    });

    if (logError) {
      console.error("Failed to log close_expired_session", logError);
    }
  }

  // Upsert cron_health row
  const { error: cronError } = await supabaseService
    .from("cron_health")
    .upsert({
      job_name: "close_expired_sessions",
      last_run_at: nowIso,
      last_status: "ok",
      status: "ok",
      college_id: "buc",
      semester_id: "2025-2026-S2",
      details: { closed_count: closedIds.length },
    });

  if (cronError) {
    console.error("Failed to upsert cron_health", cronError);
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      closed_count: closedIds.length,
      closed_session_ids: closedIds,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

serve(handler);

