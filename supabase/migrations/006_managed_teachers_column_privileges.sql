-- 006_managed_teachers_column_privileges.sql
-- Harden column-level access: never expose current_password_plain to client roles.

REVOKE SELECT (current_password_plain) ON public.managed_teachers FROM PUBLIC;
REVOKE SELECT (current_password_plain) ON public.managed_teachers FROM anon;
REVOKE SELECT (current_password_plain) ON public.managed_teachers FROM authenticated;

