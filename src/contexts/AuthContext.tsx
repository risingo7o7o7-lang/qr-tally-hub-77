import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "student" | "teacher" | "coordinator" | "head_coordinator" | "module_coordinator" | "college_admin" | "super_admin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  collegeId: string | null;
  semesterId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  collegeId: null,
  semesterId: null,
  loading: true,
  signOut: async () => {},
});

export const ROLE_ROUTE_MAP: Record<AppRole, string> = {
  student: "/student",
  teacher: "/teacher",
  coordinator: "/coordinator",
  head_coordinator: "/head-coordinator",
  module_coordinator: "/module-coordinator",
  college_admin: "/college-admin",
  super_admin: "/admin",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [collegeId, setCollegeId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserMeta = async (userId: string) => {
    try {
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("college_id, semester_id").eq("user_id", userId).single(),
      ]);

      if (roles && roles.length > 0) {
        // Pick highest priority role
        const priority: AppRole[] = ["super_admin", "college_admin", "module_coordinator", "head_coordinator", "coordinator", "teacher", "student"];
        const userRoles = roles.map((r) => r.role as AppRole);
        const topRole = priority.find((p) => userRoles.includes(p)) || "student";
        setRole(topRole);
      } else {
        setRole(null);
      }

      if (profile) {
        setCollegeId(profile.college_id);
        setSemesterId(profile.semester_id);
      }
    } catch {
      setRole(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => fetchUserMeta(session.user.id), 0);
        } else {
          setRole(null);
          setCollegeId(null);
          setSemesterId(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserMeta(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setCollegeId(null);
    setSemesterId(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, collegeId, semesterId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
