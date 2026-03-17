-- 007_college_semester_coverage.sql
-- Ensure every real-data table has college_id + semester_id.

-- audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS semester_id text NOT NULL DEFAULT '2025-2026-S2';

CREATE INDEX IF NOT EXISTS audit_logs_semester_id_idx
  ON public.audit_logs (semester_id);

-- device_reset_requests
ALTER TABLE public.device_reset_requests
  ADD COLUMN IF NOT EXISTS semester_id text NOT NULL DEFAULT '2025-2026-S2';

CREATE INDEX IF NOT EXISTS device_reset_requests_semester_id_idx
  ON public.device_reset_requests (semester_id);

-- managed_teachers
ALTER TABLE public.managed_teachers
  ADD COLUMN IF NOT EXISTS semester_id text NOT NULL DEFAULT '2025-2026-S2';

CREATE INDEX IF NOT EXISTS managed_teachers_semester_id_idx
  ON public.managed_teachers (semester_id);

-- cron_health (job telemetry is also real data for admins)
ALTER TABLE public.cron_health
  ADD COLUMN IF NOT EXISTS college_id text NOT NULL DEFAULT 'buc';

ALTER TABLE public.cron_health
  ADD COLUMN IF NOT EXISTS semester_id text NOT NULL DEFAULT '2025-2026-S2';

CREATE INDEX IF NOT EXISTS cron_health_college_id_idx
  ON public.cron_health (college_id);

CREATE INDEX IF NOT EXISTS cron_health_semester_id_idx
  ON public.cron_health (semester_id);

