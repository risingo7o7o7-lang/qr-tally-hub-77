import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { AtRiskStudents } from "@/components/dashboard/AtRiskStudents";
import { AttendanceDrilldown } from "@/components/dashboard/AttendanceDrilldown";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import { format, formatDistanceToNow } from "date-fns";
import { Users, BookOpen, Shield } from "lucide-react";
import type { Session, ManagedTeacher } from "@/lib/dashboardTypes";

export default function HeadCoordinatorDashboard() {
  const { t } = useLanguage();
  const { collegeId } = useAuth();
  const [drilldown, setDrilldown] = useState<Session | null>(null);

  // Get all managed teachers in college
  const { data: managedTeachers = [] } = useQuery({
    queryKey: ["all-managed-teachers", collegeId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("managed_teachers")
        .select("*")
        .eq("college_id", collegeId || "buc");
      if (error) throw error;
      return (data || []) as ManagedTeacher[];
    },
  });

  // Get profiles for teachers and coordinators
  const teacherIds = managedTeachers.map((m) => m.teacher_id);
  const coordinatorIds = [...new Set(managedTeachers.map((m) => m.coordinator_id))];
  const allIds = [...new Set([...teacherIds, ...coordinatorIds])];

  const { data: profiles = [] } = useQuery({
    queryKey: ["teacher-profiles", allIds.join(",")],
    enabled: allIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("user_id, name, college_email").in("user_id", allIds);
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p]));

  // Group by coordinator
  const coordinatorGroups = coordinatorIds.map((cid) => {
    const teachers = managedTeachers.filter((m) => m.coordinator_id === cid);
    return {
      coordinatorId: cid,
      coordinatorName: profileMap[cid]?.name || "Unknown",
      teacherCount: teachers.length,
    };
  });

  const csvData = managedTeachers.map((m) => ({
    Teacher: profileMap[m.teacher_id]?.name || "Unknown",
    Email: profileMap[m.teacher_id]?.college_email || "",
    "Module Coordinator": profileMap[m.coordinator_id]?.name || "Unknown",
    "Current Password": m.current_password,
    "Last Rotation": format(new Date(m.last_rotation_at), "yyyy-MM-dd HH:mm"),
    "Next Rotation": format(new Date(m.next_rotation_at), "yyyy-MM-dd HH:mm"),
  }));

  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teachers">All Teachers</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="at-risk">At-Risk Students</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatsCard title="Module Coordinators" value={coordinatorIds.length} icon={Shield} />
            <StatsCard title="Managed Teachers" value={managedTeachers.length} icon={Users} />
            <StatsCard title="Total Coverage" value={`${coordinatorIds.length} coords`} icon={BookOpen} description={`Managing ${managedTeachers.length} teachers`} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Coordinators Overview</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module Coordinator</TableHead>
                    <TableHead>Teachers Managed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coordinatorGroups.map((g) => (
                    <TableRow key={g.coordinatorId}>
                      <TableCell className="font-medium">{g.coordinatorName}</TableCell>
                      <TableCell><Badge variant="secondary">{g.teacherCount}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teachers" className="mt-4 space-y-3">
          <CSVExportButton data={csvData} filename="managed-teachers" />
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Module Coordinator</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Last Rotation</TableHead>
                  <TableHead>Next Rotation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedTeachers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{profileMap[m.teacher_id]?.name || "Unknown"}</TableCell>
                    <TableCell>{profileMap[m.coordinator_id]?.name || "Unknown"}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.current_password}</code></TableCell>
                    <TableCell className="text-sm">{format(new Date(m.last_rotation_at), "MMM d, HH:mm")}</TableCell>
                    <TableCell className="text-sm">{formatDistanceToNow(new Date(m.next_rotation_at), { addSuffix: true })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <SessionsTable onSessionClick={setDrilldown} />
          <AttendanceDrilldown session={drilldown} open={!!drilldown} onClose={() => setDrilldown(null)} />
        </TabsContent>

        <TabsContent value="at-risk" className="mt-4">
          <AtRiskStudents collegeId={collegeId || "buc"} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
