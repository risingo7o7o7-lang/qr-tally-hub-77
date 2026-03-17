export type AppRole =
  | "student"
  | "teacher"
  | "coordinator"
  | "head_coordinator"
  | "module_coordinator"
  | "college_admin"
  | "super_admin";

export const ROLE_LABELS: Record<AppRole, string> = {
  student: "Student",
  teacher: "Teacher",
  coordinator: "Coordinator",
  head_coordinator: "Head Coordinator",
  module_coordinator: "Module Coordinator",
  college_admin: "College Admin",
  super_admin: "Super Admin",
};

