-- 003_student_groups.sql
-- External student database + group assignment

-- 1. Tables

CREATE TABLE public.external_student_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  full_name text NOT NULL,
  group_code text NOT NULL CHECK (group_code IN ('A', 'B', 'C')),
  section_code text NOT NULL CHECK (section_code ~ '^[ABC](10|[1-9])$'),
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, college_id, semester_id)
);

CREATE INDEX external_student_db_student_id_idx
  ON public.external_student_db (student_id);

CREATE INDEX external_student_db_college_semester_idx
  ON public.external_student_db (college_id, semester_id);


CREATE TABLE public.student_group_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  group_code text NOT NULL CHECK (group_code IN ('A', 'B', 'C')),
  section_code text NOT NULL CHECK (section_code ~ '^[ABC](10|[1-9])$'),
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_group_assignments_college_idx
  ON public.student_group_assignments (college_id);

CREATE INDEX student_group_assignments_user_id_idx
  ON public.student_group_assignments (user_id);


-- 2. RLS

ALTER TABLE public.external_student_db ENABLE ROW LEVEL SECURITY;

-- Admins full CRUD
CREATE POLICY "Admins full access external_student_db"
  ON public.external_student_db FOR ALL
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

-- Everyone else: SELECT within same college
CREATE POLICY "Authenticated read external_student_db in college"
  ON public.external_student_db FOR SELECT
  TO authenticated
  USING (college_id = public.get_user_college_id(auth.uid()));


ALTER TABLE public.student_group_assignments ENABLE ROW LEVEL SECURITY;

-- Students read own
CREATE POLICY "Students read own student_group_assignments"
  ON public.student_group_assignments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'student')
    AND user_id = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

-- Teachers and coordinators read all in same college
CREATE POLICY "Staff read student_group_assignments in college"
  ON public.student_group_assignments FOR SELECT
  TO authenticated
  USING (
    college_id = public.get_user_college_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'teacher') OR
      public.has_role(auth.uid(), 'coordinator') OR
      public.has_role(auth.uid(), 'head_coordinator') OR
      public.has_role(auth.uid(), 'module_coordinator')
    )
  );

-- Admins full CRUD
CREATE POLICY "Admins full access student_group_assignments"
  ON public.student_group_assignments FOR ALL
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


-- 3. Auto-assign trigger

CREATE OR REPLACE FUNCTION public.handle_student_group_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text;
  v_college_id text;
  v_semester_id text;
  v_match record;
BEGIN
  v_student_id := NEW.student_id;
  v_college_id := NEW.college_id;
  v_semester_id := NEW.semester_id;

  IF v_student_id IS NULL OR btrim(v_student_id) = '' THEN
    RETURN NEW;
  END IF;

  SELECT group_code, section_code
    INTO v_match
  FROM public.external_student_db
  WHERE student_id = v_student_id
    AND college_id = v_college_id
    AND semester_id = v_semester_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.student_group_assignments (
    user_id,
    student_id,
    group_code,
    section_code,
    college_id,
    semester_id,
    assigned_at
  ) VALUES (
    NEW.user_id,
    v_student_id,
    v_match.group_code,
    v_match.section_code,
    v_college_id,
    v_semester_id,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET student_id = EXCLUDED.student_id,
        group_code = EXCLUDED.group_code,
        section_code = EXCLUDED.section_code,
        college_id = EXCLUDED.college_id,
        semester_id = EXCLUDED.semester_id,
        assigned_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profiles_group_assign ON public.profiles;

CREATE TRIGGER on_profiles_group_assign
  AFTER INSERT OR UPDATE OF student_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_student_group_assignment();


-- 4. account_stats view

CREATE OR REPLACE VIEW public.account_stats AS
WITH teacher_sessions AS (
  SELECT
    s.teacher_id AS user_id,
    count(*)::bigint AS total_sessions_created
  FROM public.attendance_sessions s
  GROUP BY s.teacher_id
),
teacher_students AS (
  SELECT
    s.teacher_id AS user_id,
    count(ar.id)::bigint AS total_students_recorded
  FROM public.attendance_sessions s
  JOIN public.attendance_records ar ON ar.session_id = s.id
  GROUP BY s.teacher_id
),
student_totals AS (
  SELECT
    ar.student_id AS user_id,
    count(*) FILTER (WHERE ar.status = 'present')::bigint AS total_present,
    count(*) FILTER (WHERE ar.status = 'suspicious')::bigint AS total_suspicious,
    count(*)::bigint AS total_records
  FROM public.attendance_records ar
  GROUP BY ar.student_id
)
SELECT
  u.user_id,
  coalesce(ts.total_sessions_created, 0) AS total_sessions_created,
  coalesce(tst.total_students_recorded, 0) AS total_students_recorded,
  coalesce(st.total_present, 0) AS total_present,
  coalesce(st.total_suspicious, 0) AS total_suspicious,
  CASE
    WHEN coalesce(st.total_records, 0) = 0 THEN 0
    ELSE round((coalesce(st.total_present, 0)::numeric / st.total_records::numeric) * 100, 2)
  END AS attendance_rate_percent
FROM (
  SELECT user_id FROM public.user_roles
) u
LEFT JOIN teacher_sessions ts ON ts.user_id = u.user_id
LEFT JOIN teacher_students tst ON tst.user_id = u.user_id
LEFT JOIN student_totals st ON st.user_id = u.user_id;

-- RLS is not supported directly on views; rely on view consumers to restrict data

