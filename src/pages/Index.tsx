import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, ROLE_ROUTE_MAP } from "@/contexts/AuthContext";

export default function Index() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
    } else if (role) {
      navigate(ROLE_ROUTE_MAP[role], { replace: true });
    }
  }, [user, role, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
