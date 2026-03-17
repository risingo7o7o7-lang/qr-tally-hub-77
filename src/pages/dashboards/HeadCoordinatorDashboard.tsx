import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { format } from "date-fns";

export default function HeadCoordinatorDashboard() {
  const online = useOnlineStatus();

  const managedQuery = useQuery({
    queryKey: ["head_managed_teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managed_teachers_safe")
        .select("id, teacher_user_id, created_by, current_password_plain, password_last_rotated, next_rotation_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const teacherIds = (data ?? []).map((d) => d.teacher_user_id);
      const creatorIds = (data ?? []).map((d) => d.created_by);
      const allIds = Array.from(new Set([...teacherIds, ...creatorIds]));
      const { data: profiles } = allIds.length
        ? await supabase.from("profiles").select("user_id, name, college_email").in("user_id", allIds)
        : { data: [] as any[] };
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      return (data ?? []).map((mt) => ({
        ...mt,
        teacher_name: byId.get(mt.teacher_user_id)?.name ?? "Teacher",
        module_coord_name: byId.get(mt.created_by)?.name ?? "Module Coordinator",
      }));
    },
  });

  const overviewQuery = useQuery({
    queryKey: ["head_overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managed_teachers")
        .select("created_by, id");
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) counts.set(row.created_by, (counts.get(row.created_by) ?? 0) + 1);
      const ids = Array.from(counts.keys());
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id, name").in("user_id", ids)
        : { data: [] as any[] };
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p.name]));
      return ids.map((id) => ({ user_id: id, name: byId.get(id) ?? "Module Coordinator", teachers_managed: counts.get(id)! }));
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["head_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_sessions")
        .select("id, teacher_id, course_name, session_type, status, start_time")
        .order("start_time", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const atRiskQuery = useQuery({
    queryKey: ["head_at_risk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_stats")
        .select("user_id, attendance_rate_percent")
        .lt("attendance_rate_percent", 75);
      if (error) throw error;
      const ids = (data ?? []).map((d) => d.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id, name, student_id").in("user_id", ids)
        : { data: [] as any[] };
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return (data ?? []).map((d) => ({ ...d, name: byId.get(d.user_id)?.name ?? "Unknown", student_id: byId.get(d.user_id)?.student_id ?? "—" }));
    },
  });

  return (
    <DashboardLayout title="Head Coordinator Dashboard">
      {!online && <OfflineBanner message="You are offline — some features may be unavailable." />}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teachers">Managed teachers</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="at-risk">At-risk</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Module coordinators overview</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module coordinator</TableHead>
                    <TableHead className="text-right">Teachers managed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overviewQuery.data ?? []).map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{r.teachers_managed}</TableCell>
                    </TableRow>
                  ))}
                  {!overviewQuery.isLoading && (overviewQuery.data?.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No managed teachers yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teachers">
          <Card>
            <CardHeader>
              <CardTitle>All managed teachers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Managed by</TableHead>
                    <TableHead>Current password</TableHead>
                    <TableHead className="text-right">Next rotation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(managedQuery.data ?? []).map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.teacher_name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.module_coord_name}</TableCell>
                      <TableCell className="font-mono text-xs">{t.current_password_plain ?? "Restricted"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {t.next_rotation_at ? format(new Date(t.next_rotation_at), "PP p") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Sessions across all teachers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Start</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sessionsQuery.data ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.course_name}</TableCell>
                      <TableCell>{s.session_type}</TableCell>
                      <TableCell><Badge variant={s.status === "active" ? "secondary" : "outline"}>{s.status}</Badge></TableCell>
                      <TableCell className="text-right">{format(new Date(s.start_time), "PP p")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="at-risk">
          <Card>
            <CardHeader>
              <CardTitle>At-risk students (below 75%)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(atRiskQuery.data ?? []).map((s: any) => (
                    <TableRow key={s.user_id}>
                      <TableCell className="font-medium text-destructive">{s.name}</TableCell>
                      <TableCell className="font-mono text-xs">{s.student_id}</TableCell>
                      <TableCell className="text-right text-destructive">{s.attendance_rate_percent}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
