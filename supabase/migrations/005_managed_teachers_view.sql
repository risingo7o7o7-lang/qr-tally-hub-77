-- 005_managed_teachers_view.sql
-- Safe view for managed teacher credentials visibility

CREATE OR REPLACE VIEW public.managed_teachers_safe AS
SELECT
  mt.id,
  mt.teacher_user_id,
  mt.created_by,
  mt.college_id,
  mt.current_password_hash,
  CASE
    WHEN public.has_role(auth.uid(), 'super_admin') THEN mt.current_password_plain
    WHEN public.has_role(auth.uid(), 'college_admin') AND mt.college_id = public.get_user_college_id(auth.uid()) THEN mt.current_password_plain
    WHEN public.has_role(auth.uid(), 'head_coordinator') AND mt.college_id = public.get_user_college_id(auth.uid()) THEN mt.current_password_plain
    WHEN public.has_role(auth.uid(), 'module_coordinator') AND mt.created_by = auth.uid() AND mt.college_id = public.get_user_college_id(auth.uid()) THEN mt.current_password_plain
    ELSE NULL
  END AS current_password_plain,
  mt.password_last_rotated,
  mt.next_rotation_at,
  mt.created_at
FROM public.managed_teachers mt;

GRANT SELECT ON public.managed_teachers_safe TO authenticated;

