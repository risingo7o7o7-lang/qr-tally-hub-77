// Local types for tables not yet in auto-generated types.ts
// These will be replaced once Supabase types regenerate.

export interface Session {
  id: string;
  teacher_id: string;
  college_id: string;
  semester_id: string;
  course_name: string;
  session_type: "lecture" | "section";
  target_group: string;
  duration_minutes: number;
  qr_token: string;
  qr_rotated_at: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  device_fingerprint: string | null;
  scanned_at: string;
}

export interface ManagedTeacher {
  id: string;
  teacher_id: string;
  coordinator_id: string;
  college_id: string;
  current_password: string;
  last_rotation_at: string;
  next_rotation_at: string;
  created_at: string;
}

export interface ExternalStudent {
  id: string;
  student_id: string;
  full_name: string;
  group_code: string;
  section_code: string;
  college_id: string;
  semester_id: string;
  created_at: string;
}

export interface StudentGroupAssignment {
  id: string;
  user_id: string;
  group_code: string;
  section_code: string;
  college_id: string;
  semester_id: string;
  assigned_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  college_id: string;
  created_at: string;
}

export interface DeviceResetRequest {
  id: string;
  user_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  college_id: string;
  created_at: string;
}

export interface AccountStat {
  user_id: string;
  name: string;
  college_id: string;
  college_email: string;
  student_id: string | null;
  attendance_count: number;
  session_count: number;
}

export interface LeaderboardEntry {
  name: string;
  rank: number;
  attendance_count: number;
}

// Groups config
export const LECTURE_GROUPS = ["All", "A", "B", "C"];
export const SECTION_GROUPS = [
  "A1","A2","A3","A4","A5","A6","A7","A8","A9","A10",
  "B1","B2","B3","B4","B5","B6","B7","B8","B9","B10",
  "C1","C2","C3","C4","C5","C6","C7","C8","C9","C10",
];
