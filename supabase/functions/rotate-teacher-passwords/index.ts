import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
  console.error("Missing required environment variables for rotate-teacher-passwords function.");
}

function sanitizePasswordBase(s: string) {
  return s.replace(/[^A-Za-z]/g, "");
}

function randomInt(max: number) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function generatePassword(): string {
  const adjectives = [
    "Bright",
    "Calm",
    "Clever",
    "Daring",
    "Eager",
    "Gentle",
    "Happy",
    "Kind",
    "Lucky",
    "Mighty",
    "Nimble",
    "Quick",
    "Sharp",
    "Silent",
    "Swift",
    "Wise",
  ];
  const nouns = [
    "Falcon",
    "River",
    "Mountain",
    "Forest",
    "Lion",
    "Tiger",
    "Eagle",
    "Comet",
    "Harbor",
    "Cedar",
    "Quartz",
    "Beacon",
    "Nova",
    "Atlas",
    "Orchid",
    "Voyage",
  ];

  const adj = sanitizePasswordBase(adjectives[randomInt(adjectives.length)]);
  const noun = sanitizePasswordBase(nouns[randomInt(nouns.length)]);
  const num = randomInt(1000).toString().padStart(3, "0");
  return `${adj}${noun}${num}`;
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const nowIso = new Date().toISOString();

  const { data: due, error: dueError } = await supabaseService
    .from("managed_teachers")
    .select("id, teacher_user_id, college_id, semester_id")
    .lte("next_rotation_at", nowIso);

  if (dueError) {
    console.error("Failed to fetch due managed teachers", dueError);
    await supabaseService.from("cron_health").upsert({
      job_name: "rotate_teacher_passwords",
      last_run_at: nowIso,
      last_status: "error",
      status: "error",
      college_id: "buc",
      semester_id: "2025-2026-S2",
      details: { message: "fetch_failed" },
    });
    return new Response("Failed to fetch due managed teachers", { status: 500 });
  }

  let rotated = 0;
  const rotatedIds: string[] = [];

  for (const row of due ?? []) {
    const newPass = generatePassword();
    const newHash = await sha256Hex(newPass);

    // Update auth user password
    const { error: authError } = await supabaseService.auth.admin.updateUserById(row.teacher_user_id, {
      password: newPass,
    });

    if (authError) {
      console.error("Failed to update auth password for user", row.teacher_user_id, authError);
      continue;
    }

    const nextRotation = new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabaseService
      .from("managed_teachers")
      .update({
        current_password_plain: newPass,
        current_password_hash: newHash,
        password_last_rotated: nowIso,
        next_rotation_at: nextRotation,
      })
      .eq("id", row.id);

    if (updateError) {
      console.error("Failed to update managed_teachers row", row.id, updateError);
      continue;
    }

    rotated++;
    rotatedIds.push(row.id);

    // Audit log
    const { error: logError } = await supabaseService.from("audit_logs").insert({
      user_id: null,
      college_id: row.college_id,
      semester_id: row.semester_id,
      action: "rotate_teacher_password",
      event_type: "admin",
      details: { managed_teacher_id: row.id, teacher_user_id: row.teacher_user_id },
    });
    if (logError) {
      console.error("Failed to log rotate_teacher_password", logError);
    }
  }

  await supabaseService.from("cron_health").upsert({
    job_name: "rotate_teacher_passwords",
    last_run_at: nowIso,
    last_status: "ok",
    status: "ok",
    college_id: "buc",
    semester_id: "2025-2026-S2",
    details: { rotated, rotated_ids: rotatedIds },
  });

  return new Response(
    JSON.stringify({ status: "ok", rotated, rotated_ids: rotatedIds }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

serve(handler);

