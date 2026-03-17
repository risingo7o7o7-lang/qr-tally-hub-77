import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type HookPayload = {
  metadata: {
    uuid: string;
    time: string;
    name: "before-user-created";
    ip_address: string;
  };
  user: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEmailDomain(email: string) {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: { http_code: 500, message: "Server misconfigured" } });
  }

  let payload: HookPayload;
  try {
    payload = (await req.json()) as HookPayload;
  } catch {
    return json(400, { error: { http_code: 400, message: "Invalid JSON payload" } });
  }

  const email = String(payload?.user?.email ?? "").trim().toLowerCase();
  const emailDomain = email ? getEmailDomain(email) : null;
  const collegeId = String((payload?.user?.user_metadata as any)?.college_id ?? "").trim().toLowerCase();

  if (!email || !emailDomain) {
    return json(400, { error: { http_code: 400, message: "Email is required" } });
  }

  if (!collegeId) {
    return json(400, { error: { http_code: 400, message: "college_id is required" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: college, error } = await supabase
    .from("colleges")
    .select("domain")
    .eq("id", collegeId)
    .single();

  if (error || !college?.domain) {
    return json(400, { error: { http_code: 400, message: "Invalid college_id" } });
  }

  const allowedDomain = String(college.domain).trim().toLowerCase();
  if (emailDomain !== allowedDomain) {
    return json(400, { error: { http_code: 400, message: `Email domain must match ${allowedDomain}` } });
  }

  // Allow signup
  return json(200, {});
});

