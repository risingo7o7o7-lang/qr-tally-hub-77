import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";

export default function CoordinatorDashboard() {
  const online = useOnlineStatus();
  const [q, setQ] = useState("");

  const sessionsQuery = useQuery({
    queryKey: ["coord_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_sessions")
        .select("id, teacher_id, course_name, session_type, status, start_time, end_time, target_group, target_section")
        .order("start_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const atRiskQuery = useQuery({
    queryKey: ["coord_at_risk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_stats")
        .select("user_id, attendance_rate_percent, total_present, total_suspicious")
        .lt("attendance_rate_percent", 75);
      if (error) throw error;
      if (!data?.length) return [];
      const ids = data.map((d) => d.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, name, student_id").in("user_id", ids);
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return data.map((d) => ({
        ...d,
        name: byId.get(d.user_id)?.name ?? "Unknown",
        student_id: byId.get(d.user_id)?.student_id ?? "—",
      }));
    },
  });

  const filteredSessions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return sessionsQuery.data ?? [];
    return (sessionsQuery.data ?? []).filter((s) =>
      `${s.course_name} ${s.session_type} ${s.status}`.toLowerCase().includes(term),
    );
  }, [q, sessionsQuery.data]);

  const exportCsv = async () => {
    const sessions = sessionsQuery.data ?? [];
    const rows = sessions.map((s) => ({
      id: s.id,
      course_name: s.course_name,
      session_type: s.session_type,
      status: s.status,
      start_time: s.start_time,
      end_time: s.end_time,
      target_group: s.target_group,
      target_section: s.target_section,
      teacher_id: s.teacher_id,
    }));
    const headers = Object.keys(rows[0] ?? {});
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coordinator-sessions.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout title="Coordinator Dashboard">
      {!online && <OfflineBanner message="You are offline — some features may be unavailable." />}

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="at-risk">At-risk students</TabsTrigger>
          <TabsTrigger value="export">Bulk export</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>All sessions</CardTitle>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by course, type, status…" className="max-w-xs" />
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
                  {filteredSessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.course_name}</TableCell>
                      <TableCell>{s.session_type}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "secondary" : "outline"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{format(new Date(s.start_time), "PP p")}</TableCell>
                    </TableRow>
                  ))}
                  {!sessionsQuery.isLoading && filteredSessions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">No sessions.</TableCell>
                    </TableRow>
                  )}
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
                    <TableHead className="text-right">Attendance rate</TableHead>
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
                  {!atRiskQuery.isLoading && (atRiskQuery.data?.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No at-risk students found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle>Bulk CSV export</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">Exports the current sessions list to CSV.</div>
              <Button onClick={exportCsv}>Download CSV</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
