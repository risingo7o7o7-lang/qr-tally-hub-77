
-- Fix security linter issues

-- 1. Fix Security Definer View: recreate account_stats as SECURITY INVOKER
DROP VIEW IF EXISTS public.account_stats;
CREATE VIEW public.account_stats WITH (security_invoker = true) AS
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

-- 2. Fix Function Search Path Mutable
CREATE OR REPLACE FUNCTION public.validate_session_type()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.session_type NOT IN ('lecture', 'section') THEN
    RAISE EXCEPTION 'Invalid session_type: %', NEW.session_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_reset_status()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Fix overly permissive audit logs insert policy
DROP POLICY IF EXISTS "Authenticated insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid());
