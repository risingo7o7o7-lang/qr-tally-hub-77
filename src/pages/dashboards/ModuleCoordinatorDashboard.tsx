import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "@/hooks/use-toast";

export default function ModuleCoordinatorDashboard() {
  const { user, collegeId } = useAuth();
  const online = useOnlineStatus();
  const qc = useQueryClient();

  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherEmail, setNewTeacherEmail] = useState("");

  const teachersQuery = useQuery({
    queryKey: ["my_managed_teachers", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managed_teachers_safe")
        .select("id, teacher_user_id, created_by, college_id, current_password_plain, password_last_rotated, next_rotation_at")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (data ?? []).map((d) => d.teacher_user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id, name, college_email").in("user_id", ids)
        : { data: [] as any[] };
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      return (data ?? []).map((t) => ({
        ...t,
        name: byId.get(t.teacher_user_id)?.name ?? "Teacher",
        email: byId.get(t.teacher_user_id)?.college_email ?? "—",
      }));
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["module_sessions", teachersQuery.data?.map((t: any) => t.teacher_user_id).join(",")],
    enabled: (teachersQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const teacherIds = (teachersQuery.data ?? []).map((t: any) => t.teacher_user_id);
      const { data, error } = await supabase
        .from("attendance_sessions")
        .select("id, teacher_id, course_name, session_type, status, start_time")
        .in("teacher_id", teacherIds)
        .order("start_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const atRiskQuery = useQuery({
    queryKey: ["module_at_risk", collegeId],
    enabled: !!collegeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_stats")
        .select("user_id, attendance_rate_percent")
        .lt("attendance_rate_percent", 75);
      if (error) throw error;
      if (!data?.length) return [];
      const ids = data.map((d) => d.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, name, student_id").in("user_id", ids);
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return data.map((d) => ({ ...d, name: byId.get(d.user_id)?.name ?? "Unknown", student_id: byId.get(d.user_id)?.student_id ?? "—" }));
    },
  });

  const createTeacher = async () => {
    if (!newTeacherEmail.trim()) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "create_user", email: newTeacherEmail.trim(), name: newTeacherName.trim(), role: "teacher" },
    });
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Teacher created", description: "New teacher added to your list." });
    setNewTeacherEmail("");
    setNewTeacherName("");
    qc.invalidateQueries({ queryKey: ["my_managed_teachers", user?.id] });
  };

  const myTeachers = teachersQuery.data ?? [];
  const upcoming = useMemo(() => {
    return myTeachers.map((t: any) => ({
      ...t,
      nextIn: t.next_rotation_at ? formatDistanceToNowStrict(new Date(t.next_rotation_at), { addSuffix: true }) : "—",
    }));
  }, [myTeachers]);

  return (
    <DashboardLayout title="Module Coordinator Dashboard">
      {!online && <OfflineBanner message="You are offline — some features may be unavailable." />}

      <Tabs defaultValue="teachers">
        <TabsList>
          <TabsTrigger value="teachers">My teachers</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="at-risk">At-risk</TabsTrigger>
        </TabsList>

        <TabsContent value="teachers">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>My teachers</CardTitle>
                <Badge variant="secondary">{myTeachers.length}</Badge>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Current password</TableHead>
                      <TableHead>Next rotation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-muted-foreground">{t.email}</TableCell>
                        <TableCell className="font-mono text-xs">{t.current_password_plain ?? "Restricted"}</TableCell>
                        <TableCell className="text-muted-foreground">{t.nextIn}</TableCell>
                      </TableRow>
                    ))}
                    {!teachersQuery.isLoading && upcoming.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No managed teachers yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create teacher account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} placeholder="Teacher name" />
                </div>
                <div className="space-y-1">
                  <Label>College email</Label>
                  <Input value={newTeacherEmail} onChange={(e) => setNewTeacherEmail(e.target.value)} placeholder="name@college.edu" />
                </div>
                <Button onClick={createTeacher} disabled={!online} className="w-full">Create</Button>
                <div className="text-xs text-muted-foreground">
                  This uses the `admin-manage-user` function and automatically adds the teacher to your managed list.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Sessions (my scope)</CardTitle>
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
                      <TableCell className="text-right">{formatDistanceToNowStrict(new Date(s.start_time), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                  {!sessionsQuery.isLoading && (sessionsQuery.data?.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No sessions found.</TableCell></TableRow>
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
                  {!atRiskQuery.isLoading && (atRiskQuery.data?.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No at-risk students found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
