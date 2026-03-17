export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      attendance_records: {
        Row: {
          college_id: string
          device_fingerprint: string | null
          id: string
          semester_id: string
          session_id: string
          status: "present" | "suspicious"
          student_id: string
          submitted_at: string
          synced: boolean
        }
        Insert: {
          college_id?: string
          device_fingerprint?: string | null
          id?: string
          semester_id?: string
          session_id: string
          status?: "present" | "suspicious"
          student_id: string
          submitted_at?: string
          synced?: boolean
        }
        Update: {
          college_id?: string
          device_fingerprint?: string | null
          id?: string
          semester_id?: string
          session_id?: string
          status?: "present" | "suspicious"
          student_id?: string
          submitted_at?: string
          synced?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          college_id: string
          course_name: string
          created_at: string
          current_qr_token: string | null
          duration_minutes: number
          end_time: string | null
          grace_period_minutes: number | null
          id: string
          qr_secret: string | null
          qr_token_expires_at: string | null
          refresh_interval: number
          semester_id: string
          session_type: "lecture" | "section" | null
          start_time: string
          status: "active" | "ended"
          target_group: string | null
          target_section: string | null
          teacher_id: string
        }
        Insert: {
          college_id?: string
          course_name: string
          created_at?: string
          current_qr_token?: string | null
          duration_minutes?: number
          end_time?: string | null
          grace_period_minutes?: number | null
          id?: string
          qr_secret?: string | null
          qr_token_expires_at?: string | null
          refresh_interval?: number
          semester_id?: string
          session_type?: "lecture" | "section" | null
          start_time?: string
          status?: "active" | "ended"
          target_group?: string | null
          target_section?: string | null
          teacher_id: string
        }
        Update: {
          college_id?: string
          course_name?: string
          created_at?: string
          current_qr_token?: string | null
          duration_minutes?: number
          end_time?: string | null
          grace_period_minutes?: number | null
          id?: string
          qr_secret?: string | null
          qr_token_expires_at?: string | null
          refresh_interval?: number
          semester_id?: string
          session_type?: "lecture" | "section" | null
          start_time?: string
          status?: "active" | "ended"
          target_group?: string | null
          target_section?: string | null
          teacher_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          college_id: string
          created_at: string
          details: Json | null
          device_hash: string | null
          event_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          semester_id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          college_id?: string
          created_at?: string
          details?: Json | null
          device_hash?: string | null
          event_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          semester_id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          college_id?: string
          created_at?: string
          details?: Json | null
          device_hash?: string | null
          event_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          semester_id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      colleges: {
        Row: {
          created_at: string
          domain: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          domain: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          college_email: string
          college_id: string
          created_at: string
          deleted_at: string | null
          device_bound: boolean
          device_hash: string | null
          id: string
          name: string
          semester_id: string
          student_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          college_email: string
          college_id?: string
          created_at?: string
          deleted_at?: string | null
          device_bound?: boolean
          device_hash?: string | null
          id?: string
          name: string
          semester_id?: string
          student_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          college_email?: string
          college_id?: string
          created_at?: string
          deleted_at?: string | null
          device_bound?: boolean
          device_hash?: string | null
          id?: string
          name?: string
          semester_id?: string
          student_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      semesters: {
        Row: {
          college_id: string
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
        }
        Insert: {
          college_id: string
          created_at?: string
          end_date: string
          id: string
          is_active?: boolean
          name: string
          start_date: string
        }
        Update: {
          college_id?: string
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          college_id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          college_id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          college_id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      cron_health: {
        Row: {
          college_id: string
          details: Json | null
          job_name: string
          last_run_at: string
          last_status: string
          semester_id: string
          status: string | null
        }
        Insert: {
          college_id?: string
          details?: Json | null
          job_name: string
          last_run_at?: string
          last_status: string
          semester_id?: string
          status?: string | null
        }
        Update: {
          college_id?: string
          details?: Json | null
          job_name?: string
          last_run_at?: string
          last_status?: string
          semester_id?: string
          status?: string | null
        }
        Relationships: []
      }
      device_reset_requests: {
        Row: {
          admin_id: string | null
          college_id: string
          created_at: string
          id: string
          reason: string | null
          resolved_at: string | null
          semester_id: string
          status: "pending" | "approved" | "rejected"
          student_id: string
        }
        Insert: {
          admin_id?: string | null
          college_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          semester_id?: string
          status?: "pending" | "approved" | "rejected"
          student_id: string
        }
        Update: {
          admin_id?: string | null
          college_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          semester_id?: string
          status?: "pending" | "approved" | "rejected"
          student_id?: string
        }
        Relationships: []
      }
      external_student_db: {
        Row: {
          college_id: string
          created_at: string
          full_name: string
          group_code: "A" | "B" | "C"
          id: string
          section_code: string
          semester_id: string
          student_id: string
        }
        Insert: {
          college_id?: string
          created_at?: string
          full_name: string
          group_code: "A" | "B" | "C"
          id?: string
          section_code: string
          semester_id?: string
          student_id: string
        }
        Update: {
          college_id?: string
          created_at?: string
          full_name?: string
          group_code?: "A" | "B" | "C"
          id?: string
          section_code?: string
          semester_id?: string
          student_id?: string
        }
        Relationships: []
      }
      managed_teachers: {
        Row: {
          college_id: string
          created_at: string
          created_by: string
          current_password_hash: string
          current_password_plain: string
          id: string
          next_rotation_at: string
          password_last_rotated: string
          semester_id: string
          teacher_user_id: string
        }
        Insert: {
          college_id?: string
          created_at?: string
          created_by: string
          current_password_hash: string
          current_password_plain: string
          id?: string
          next_rotation_at?: string
          password_last_rotated?: string
          semester_id?: string
          teacher_user_id: string
        }
        Update: {
          college_id?: string
          created_at?: string
          created_by?: string
          current_password_hash?: string
          current_password_plain?: string
          id?: string
          next_rotation_at?: string
          password_last_rotated?: string
          semester_id?: string
          teacher_user_id?: string
        }
        Relationships: []
      }
      student_group_assignments: {
        Row: {
          assigned_at: string
          college_id: string
          group_code: "A" | "B" | "C"
          id: string
          section_code: string
          semester_id: string
          student_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          college_id?: string
          group_code: "A" | "B" | "C"
          id?: string
          section_code: string
          semester_id?: string
          student_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          college_id?: string
          group_code?: "A" | "B" | "C"
          id?: string
          section_code?: string
          semester_id?: string
          student_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          college_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          college_id?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          college_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_stats: {
        Row: {
          attendance_rate_percent: number
          total_present: number
          total_sessions_created: number
          total_students_recorded: number
          total_suspicious: number
          user_id: string
        }
        Relationships: []
      }
      managed_teachers_safe: {
        Row: {
          college_id: string
          created_at: string
          created_by: string
          current_password_hash: string
          current_password_plain: string | null
          id: string
          next_rotation_at: string
          password_last_rotated: string
          teacher_user_id: string
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_college_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      student_attended_session: { Args: { _session_id: string; _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "student"
        | "teacher"
        | "coordinator"
        | "head_coordinator"
        | "module_coordinator"
        | "college_admin"
        | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "student",
        "teacher",
        "coordinator",
        "head_coordinator",
        "module_coordinator",
        "college_admin",
        "super_admin",
      ],
    },
  },
} as const
