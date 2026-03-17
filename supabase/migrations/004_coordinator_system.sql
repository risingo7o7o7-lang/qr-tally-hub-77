-- 004_coordinator_system.sql
-- Coordinator system + managed teachers

-- 1. managed_teachers

CREATE TABLE public.managed_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  college_id text NOT NULL DEFAULT 'buc',
  current_password_hash text NOT NULL,
  current_password_plain text NOT NULL,
  password_last_rotated timestamptz NOT NULL DEFAULT now(),
  next_rotation_at timestamptz NOT NULL DEFAULT (now() + interval '16 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX managed_teachers_teacher_user_id_uidx
  ON public.managed_teachers (teacher_user_id);

CREATE INDEX managed_teachers_created_by_idx
  ON public.managed_teachers (created_by);

CREATE INDEX managed_teachers_next_rotation_idx
  ON public.managed_teachers (next_rotation_at);


-- 2. RLS

ALTER TABLE public.managed_teachers ENABLE ROW LEVEL SECURITY;

-- Module coordinators: select where created_by = auth.uid()
CREATE POLICY "Module coordinators read own managed_teachers"
  ON public.managed_teachers FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'module_coordinator')
    AND created_by = auth.uid()
    AND college_id = public.get_user_college_id(auth.uid())
  );

-- Head coordinators: select all in same college
CREATE POLICY "Head coordinators read managed_teachers in college"
  ON public.managed_teachers FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'head_coordinator')
    AND college_id = public.get_user_college_id(auth.uid())
  );

-- College admin / super admin: full CRUD
CREATE POLICY "Admins full access managed_teachers"
  ON public.managed_teachers FOR ALL
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


-- 3. Column-level security for current_password_plain
-- Deny selecting current_password_plain for all authenticated by default,
-- then explicitly allow for admin/head/module coordinator roles via a view approach.
-- (PostgREST respects column privileges when querying tables directly.)

REVOKE SELECT (current_password_plain) ON public.managed_teachers FROM authenticated;

-- Also deny teachers/students explicitly (defensive)
REVOKE SELECT (current_password_plain) ON public.managed_teachers FROM anon;


-- 4. cron_health alignment
-- cron_health already exists from 002; ensure it has a 'status' column for Prompt 4 compatibility.

ALTER TABLE public.cron_health
  ADD COLUMN IF NOT EXISTS status text;

-- Backfill status from last_status if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cron_health'
      AND column_name = 'last_status'
  ) THEN
    UPDATE public.cron_health
      SET status = COALESCE(status, last_status);
  END IF;
END;
$$;

