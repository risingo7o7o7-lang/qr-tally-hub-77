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
          device_fingerprint: string | null
          id: string
          scanned_at: string
          session_id: string
          student_id: string
        }
        Insert: {
          device_fingerprint?: string | null
          id?: string
          scanned_at?: string
          session_id: string
          student_id: string
        }
        Update: {
          device_fingerprint?: string | null
          id?: string
          scanned_at?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          college_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          college_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          college_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
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
      device_reset_requests: {
        Row: {
          college_id: string
          created_at: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          college_id?: string
          created_at?: string
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          college_id?: string
          created_at?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      external_student_db: {
        Row: {
          college_id: string
          created_at: string
          full_name: string
          group_code: string
          id: string
          section_code: string
          semester_id: string
          student_id: string
        }
        Insert: {
          college_id?: string
          created_at?: string
          full_name: string
          group_code: string
          id?: string
          section_code: string
          semester_id?: string
          student_id: string
        }
        Update: {
          college_id?: string
          created_at?: string
          full_name?: string
          group_code?: string
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
          coordinator_id: string
          created_at: string
          current_password: string
          id: string
          last_rotation_at: string
          next_rotation_at: string
          teacher_id: string
        }
        Insert: {
          college_id?: string
          coordinator_id: string
          created_at?: string
          current_password: string
          id?: string
          last_rotation_at?: string
          next_rotation_at?: string
          teacher_id: string
        }
        Update: {
          college_id?: string
          coordinator_id?: string
          created_at?: string
          current_password?: string
          id?: string
          last_rotation_at?: string
          next_rotation_at?: string
          teacher_id?: string
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
      sessions: {
        Row: {
          college_id: string
          course_name: string
          created_at: string
          duration_minutes: number
          ended_at: string | null
          id: string
          qr_rotated_at: string
          qr_token: string
          semester_id: string
          session_type: string
          started_at: string
          target_group: string
          teacher_id: string
        }
        Insert: {
          college_id?: string
          course_name: string
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          qr_rotated_at?: string
          qr_token?: string
          semester_id?: string
          session_type?: string
          started_at?: string
          target_group?: string
          teacher_id: string
        }
        Update: {
          college_id?: string
          course_name?: string
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          qr_rotated_at?: string
          qr_token?: string
          semester_id?: string
          session_type?: string
          started_at?: string
          target_group?: string
          teacher_id?: string
        }
        Relationships: []
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
      student_group_assignments: {
        Row: {
          assigned_at: string
          college_id: string
          group_code: string
          id: string
          section_code: string
          semester_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          college_id?: string
          group_code: string
          id?: string
          section_code: string
          semester_id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          college_id?: string
          group_code?: string
          id?: string
          section_code?: string
          semester_id?: string
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
          attendance_count: number | null
          college_email: string | null
          college_id: string | null
          name: string | null
          session_count: number | null
          student_id: string | null
          user_id: string | null
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
      student_leaderboard: {
        Args: { _college_id: string; _limit?: number; _semester_id: string }
        Returns: {
          attendance_count: number
          name: string
          rank: number
        }[]
      }
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
