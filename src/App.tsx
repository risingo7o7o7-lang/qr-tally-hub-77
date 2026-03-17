import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import StudentDashboard from "./pages/dashboards/StudentDashboard";
import TeacherDashboard from "./pages/dashboards/TeacherDashboard";
import CoordinatorDashboard from "./pages/dashboards/CoordinatorDashboard";
import HeadCoordinatorDashboard from "./pages/dashboards/HeadCoordinatorDashboard";
import ModuleCoordinatorDashboard from "./pages/dashboards/ModuleCoordinatorDashboard";
import CollegeAdminDashboard from "./pages/dashboards/CollegeAdminDashboard";
import SuperAdminDashboard from "./pages/dashboards/SuperAdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/student" element={<ProtectedRoute allowedRole="student"><StudentDashboard /></ProtectedRoute>} />
                <Route path="/teacher" element={<ProtectedRoute allowedRole="teacher"><TeacherDashboard /></ProtectedRoute>} />
                <Route path="/coordinator" element={<ProtectedRoute allowedRole="coordinator"><CoordinatorDashboard /></ProtectedRoute>} />
                <Route path="/head-coordinator" element={<ProtectedRoute allowedRole="head_coordinator"><HeadCoordinatorDashboard /></ProtectedRoute>} />
                <Route path="/module-coordinator" element={<ProtectedRoute allowedRole="module_coordinator"><ModuleCoordinatorDashboard /></ProtectedRoute>} />
                <Route path="/college-admin" element={<ProtectedRoute allowedRole="college_admin"><CollegeAdminDashboard /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute allowedRole="super_admin"><SuperAdminDashboard /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
