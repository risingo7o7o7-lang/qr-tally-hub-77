-- 002_attendance_schema.sql
-- Core attendance system: tables, RLS, helper functions, and realtime

-- 1. Tables

CREATE TABLE public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  course_name text NOT NULL,
  session_type text CHECK (session_type IN ('lecture', 'section')),
  target_group text,
  target_section text,
  qr_secret text,
  current_qr_token text,
  qr_token_expires_at timestamptz,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  duration_minutes integer NOT NULL DEFAULT 15,
  grace_period_minutes integer DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  refresh_interval integer NOT NULL DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce allowed values for target_group and target_section via CHECK constraints
ALTER TABLE public.attendance_sessions
  ADD CONSTRAINT attendance_sessions_target_group_check
  CHECK (target_group IS NULL OR target_group IN ('A', 'B', 'C', 'all'));

ALTER TABLE public.attendance_sessions
  ADD CONSTRAINT attendance_sessions_target_section_check
  CHECK (
    target_section IS NULL OR
    target_section ~ '^[ABC](10|[1-9])$'
  );

CREATE INDEX attendance_sessions_teacher_id_idx
  ON public.attendance_sessions (teacher_id);

CREATE INDEX attendance_sessions_status_idx
  ON public.attendance_sessions (status);

CREATE INDEX attendance_sessions_start_time_idx
  ON public.attendance_sessions (start_time);

CREATE INDEX attendance_sessions_college_id_idx
  ON public.attendance_sessions (college_id);

CREATE INDEX attendance_sessions_semester_id_idx
  ON public.attendance_sessions (semester_id);


CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  device_fingerprint text,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'suspicious')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  synced boolean NOT NULL DEFAULT true,
  UNIQUE (session_id, student_id)
);

CREATE INDEX attendance_records_session_id_idx
  ON public.attendance_records (session_id);

CREATE INDEX attendance_records_student_id_idx
  ON public.attendance_records (student_id);

CREATE INDEX attendance_records_submitted_at_idx
  ON public.attendance_records (submitted_at);


CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  college_id text NOT NULL DEFAULT 'buc',
  action text NOT NULL,
  event_type text,
  session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,
  device_hash text,
  ip_address text,
  details jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_user_id_idx
  ON public.audit_logs (user_id);

CREATE INDEX audit_logs_created_at_idx
  ON public.audit_logs (created_at);

CREATE INDEX audit_logs_college_id_idx
  ON public.audit_logs (college_id);


CREATE TABLE public.device_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  college_id text NOT NULL DEFAULT 'buc',
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX device_reset_requests_student_id_idx
  ON public.device_reset_requests (student_id);

CREATE INDEX device_reset_requests_status_idx
  ON public.device_reset_requests (status);


-- Simple cron health table for tracking background jobs
CREATE TABLE IF NOT EXISTS public.cron_health (
  job_name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb
);


-- 2. Helper function

CREATE OR REPLACE FUNCTION public.student_attended_session(_user_id uuid, _session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    WHERE ar.student_id = _user_id
      AND ar.session_id = _session_id
  );
$$;


-- 3. RLS policies

-- attendance_sessions
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Teachers: insert/update/select own sessions
CREATE POLICY "Teachers insert own attendance_sessions"
  ON public.attendance_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND teacher_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

CREATE POLICY "Teachers manage own attendance_sessions"
  ON public.attendance_sessions FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND teacher_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND teacher_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

CREATE POLICY "Teachers read own attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND teacher_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

-- Students: select active sessions in their college and sessions they attended
CREATE POLICY "Students read active or attended sessions"
  ON public.attendance_sessions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'student')
    AND college_id = public.get_user_college_id(auth.uid())
    AND (
      status = 'active'
      OR public.student_attended_session(auth.uid(), id)
    )
  );

-- Coordinators / heads / module coordinators: read all in same college_id
CREATE POLICY "Coordinators read sessions in college"
  ON public.attendance_sessions FOR SELECT
  TO authenticated
  USING (
    college_id = public.get_user_college_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'coordinator') OR
      public.has_role(auth.uid(), 'head_coordinator') OR
      public.has_role(auth.uid(), 'module_coordinator')
    )
  );

-- College admins and super admins: full CRUD
CREATE POLICY "Admins full access attendance_sessions"
  ON public.attendance_sessions FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'college_admin')
      AND college_id = public.get_user_college_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'college_admin')
      AND college_id = public.get_user_college_id(auth.uid())
    )
  );


-- attendance_records
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Students: insert/select own records
CREATE POLICY "Students insert own attendance_records"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'student')
    AND student_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

CREATE POLICY "Students read own attendance_records"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'student')
    AND student_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

-- Teachers: select records for their sessions
CREATE POLICY "Teachers read attendance_records for own sessions"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND s.teacher_id = auth.uid()
        AND s.college_id = public.get_user_college_id(auth.uid())
    )
  );

-- Coordinators and above: read all in same college_id
CREATE POLICY "Coordinators read attendance_records in college"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    college_id = public.get_user_college_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'coordinator') OR
      public.has_role(auth.uid(), 'head_coordinator') OR
      public.has_role(auth.uid(), 'module_coordinator') OR
      public.has_role(auth.uid(), 'college_admin') OR
      public.has_role(auth.uid(), 'super_admin')
    )
  );

-- College admins and super admins: full CRUD
CREATE POLICY "Admins full access attendance_records"
  ON public.attendance_records FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'college_admin')
      AND college_id = public.get_user_college_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'college_admin')
      AND college_id = public.get_user_college_id(auth.uid())
    )
  );


-- audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- No direct client inserts: edge functions will use service role and bypass RLS.

-- College admins and super admins: read all audit logs in their college
CREATE POLICY "Admins read audit_logs in college"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    college_id = public.get_user_college_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'college_admin') OR
      public.has_role(auth.uid(), 'super_admin')
    )
  );


-- device_reset_requests
ALTER TABLE public.device_reset_requests ENABLE ROW LEVEL SECURITY;

-- Students: insert/select own requests
CREATE POLICY "Students insert own device_reset_requests"
  ON public.device_reset_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'student')
    AND student_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

CREATE POLICY "Students read own device_reset_requests"
  ON public.device_reset_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'student')
    AND student_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

-- College admins and super admins: full CRUD
CREATE POLICY "Admins full access device_reset_requests"
  ON public.device_reset_requests FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'college_admin')
      AND college_id = public.get_user_college_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'college_admin')
      AND college_id = public.get_user_college_id(auth.uid())
    )
  );


-- 4. Realtime publication

-- Ensure these tables are part of the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;

