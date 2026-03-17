import { Navigate } from "react-router-dom";
import { useAuth, ROLE_ROUTE_MAP } from "@/contexts/AuthContext";

type AppRole = "student" | "teacher" | "coordinator" | "head_coordinator" | "module_coordinator" | "college_admin" | "super_admin";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole: AppRole;
}

export function ProtectedRoute({ children, allowedRole }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && role !== allowedRole) {
    return <Navigate to={ROLE_ROUTE_MAP[role]} replace />;
  }

  return <>{children}</>;
}
