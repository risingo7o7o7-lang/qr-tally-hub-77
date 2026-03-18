
-- =============================================
-- Migration: Core attendance & management schema
-- =============================================

-- Sessions table
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  course_name text NOT NULL,
  session_type text NOT NULL DEFAULT 'lecture',
  target_group text NOT NULL DEFAULT 'All',
  duration_minutes integer NOT NULL DEFAULT 90,
  qr_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  qr_rotated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for session_type
CREATE OR REPLACE FUNCTION public.validate_session_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.session_type NOT IN ('lecture', 'section') THEN
    RAISE EXCEPTION 'Invalid session_type: %', NEW.session_type;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_session_type
BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_session_type();

-- Attendance records
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  device_fingerprint text,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, student_id)
);

-- Managed teachers
CREATE TABLE public.managed_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL UNIQUE,
  coordinator_id uuid NOT NULL,
  college_id text NOT NULL DEFAULT 'buc',
  current_password text NOT NULL,
  last_rotation_at timestamptz NOT NULL DEFAULT now(),
  next_rotation_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- External student database (CSV imported)
CREATE TABLE public.external_student_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  full_name text NOT NULL,
  group_code text NOT NULL,
  section_code text NOT NULL,
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, college_id, semester_id)
);

-- Student group assignments
CREATE TABLE public.student_group_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_code text NOT NULL,
  section_code text NOT NULL,
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, college_id, semester_id)
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb DEFAULT '{}',
  college_id text NOT NULL DEFAULT 'buc',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Device reset requests
CREATE TABLE public.device_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  college_id text NOT NULL DEFAULT 'buc',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for device reset status
CREATE OR REPLACE FUNCTION public.validate_reset_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_reset_status
BEFORE INSERT OR UPDATE ON public.device_reset_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_reset_status();

-- Account stats view
CREATE OR REPLACE VIEW public.account_stats AS
SELECT
  p.user_id,
  p.name,
  p.college_id,
  p.college_email,
  p.student_id,
  COALESCE(att.attendance_count, 0)::integer AS attendance_count,
  COALESCE(sess.session_count, 0)::integer AS session_count
FROM public.profiles p
LEFT JOIN (
  SELECT student_id, COUNT(*)::integer AS attendance_count
  FROM public.attendance_records
  GROUP BY student_id
) att ON att.student_id = p.user_id
LEFT JOIN (
  SELECT teacher_id, COUNT(*)::integer AS session_count
  FROM public.sessions
  GROUP BY teacher_id
) sess ON sess.teacher_id = p.user_id;

-- Student leaderboard RPC
CREATE OR REPLACE FUNCTION public.student_leaderboard(
  _college_id text,
  _semester_id text,
  _limit integer DEFAULT 50
)
RETURNS TABLE(name text, rank bigint, attendance_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.name,
    ROW_NUMBER() OVER (ORDER BY COUNT(ar.id) DESC) as rank,
    COUNT(ar.id) as attendance_count
  FROM profiles p
  INNER JOIN user_roles ur ON ur.user_id = p.user_id AND ur.role = 'student'
  LEFT JOIN attendance_records ar ON ar.student_id = p.user_id
  WHERE p.college_id = _college_id
    AND p.semester_id = _semester_id
  GROUP BY p.user_id, p.name
  ORDER BY attendance_count DESC
  LIMIT _limit;
$$;

-- =============================================
-- RLS Policies
-- =============================================

-- Sessions RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers CRUD own sessions" ON public.sessions
FOR ALL TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Staff read sessions in college" ON public.sessions
FOR SELECT TO authenticated
USING (
  college_id = get_user_college_id(auth.uid())
  AND (
    has_role(auth.uid(), 'coordinator') OR
    has_role(auth.uid(), 'head_coordinator') OR
    has_role(auth.uid(), 'module_coordinator')
  )
);

CREATE POLICY "Admins full access sessions" ON public.sessions
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  (has_role(auth.uid(), 'college_admin') AND college_id = get_user_college_id(auth.uid()))
);

CREATE POLICY "Students read active sessions" ON public.sessions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'student') AND ended_at IS NULL
);

-- Attendance records RLS
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own attendance" ON public.attendance_records
FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Students insert own attendance" ON public.attendance_records
FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers read attendance for own sessions" ON public.attendance_records
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND s.teacher_id = auth.uid()
  )
);

CREATE POLICY "Staff read attendance in college" ON public.attendance_records
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id
    AND s.college_id = get_user_college_id(auth.uid())
    AND (
      has_role(auth.uid(), 'coordinator') OR
      has_role(auth.uid(), 'head_coordinator') OR
      has_role(auth.uid(), 'module_coordinator')
    )
  )
);

CREATE POLICY "Admins full access attendance" ON public.attendance_records
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'college_admin')
);

-- Managed teachers RLS
ALTER TABLE public.managed_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators CRUD own managed teachers" ON public.managed_teachers
FOR ALL TO authenticated
USING (coordinator_id = auth.uid())
WITH CHECK (coordinator_id = auth.uid());

CREATE POLICY "Head coordinators read in college" ON public.managed_teachers
FOR SELECT TO authenticated
USING (
  college_id = get_user_college_id(auth.uid())
  AND has_role(auth.uid(), 'head_coordinator')
);

CREATE POLICY "Admins full access managed teachers" ON public.managed_teachers
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  (has_role(auth.uid(), 'college_admin') AND college_id = get_user_college_id(auth.uid()))
);

-- External student DB RLS
ALTER TABLE public.external_student_db ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read external students" ON public.external_student_db
FOR SELECT TO authenticated
USING (
  college_id = get_user_college_id(auth.uid())
);

CREATE POLICY "Admins full access external students" ON public.external_student_db
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  (has_role(auth.uid(), 'college_admin') AND college_id = get_user_college_id(auth.uid()))
);

-- Student group assignments RLS
ALTER TABLE public.student_group_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own assignment" ON public.student_group_assignments
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff read assignments in college" ON public.student_group_assignments
FOR SELECT TO authenticated
USING (
  college_id = get_user_college_id(auth.uid())
);

CREATE POLICY "Admins full access assignments" ON public.student_group_assignments
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  (has_role(auth.uid(), 'college_admin') AND college_id = get_user_college_id(auth.uid()))
);

-- Audit logs RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  (has_role(auth.uid(), 'college_admin') AND college_id = get_user_college_id(auth.uid()))
);

CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (true);

-- Device reset requests RLS
ALTER TABLE public.device_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own reset requests" ON public.device_reset_requests
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins full access reset requests" ON public.device_reset_requests
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR
  (has_role(auth.uid(), 'college_admin') AND college_id = get_user_college_id(auth.uid()))
);

-- Indexes
CREATE INDEX idx_sessions_teacher_id ON public.sessions(teacher_id);
CREATE INDEX idx_sessions_college_semester ON public.sessions(college_id, semester_id);
CREATE INDEX idx_attendance_session_id ON public.attendance_records(session_id);
CREATE INDEX idx_attendance_student_id ON public.attendance_records(student_id);
CREATE INDEX idx_managed_teachers_coordinator ON public.managed_teachers(coordinator_id);
CREATE INDEX idx_external_students_college ON public.external_student_db(college_id, semester_id);
CREATE INDEX idx_group_assignments_user ON public.student_group_assignments(user_id);
CREATE INDEX idx_audit_logs_college ON public.audit_logs(college_id);
CREATE INDEX idx_device_resets_user ON public.device_reset_requests(user_id);
