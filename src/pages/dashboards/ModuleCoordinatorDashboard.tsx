import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { AtRiskStudents } from "@/components/dashboard/AtRiskStudents";
import { AttendanceDrilldown } from "@/components/dashboard/AttendanceDrilldown";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import { format, formatDistanceToNow } from "date-fns";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Session, ManagedTeacher } from "@/lib/dashboardTypes";

export default function ModuleCoordinatorDashboard() {
  const { t } = useLanguage();
  const { user, collegeId } = useAuth();
  const queryClient = useQueryClient();
  const [drilldown, setDrilldown] = useState<Session | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");

  // My managed teachers
  const { data: myTeachers = [] } = useQuery({
    queryKey: ["my-managed-teachers", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("managed_teachers")
        .select("*")
        .eq("coordinator_id", user!.id);
      if (error) throw error;
      return (data || []) as ManagedTeacher[];
    },
  });

  const teacherIds = myTeachers.map((t) => t.teacher_id);

  const { data: teacherProfiles = [] } = useQuery({
    queryKey: ["teacher-profiles", teacherIds.join(",")],
    enabled: teacherIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("user_id, name, college_email").in("user_id", teacherIds);
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(teacherProfiles.map((p) => [p.user_id, p]));

  // Create teacher
  const createTeacher = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "create_user",
          email: teacherEmail,
          name: teacherName,
          role: "teacher",
          college_id: collegeId || "buc",
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Teacher created. Password: ${data.password}`);
      setCreateOpen(false);
      setTeacherName("");
      setTeacherEmail("");
      queryClient.invalidateQueries({ queryKey: ["my-managed-teachers"] });
    },
    onError: () => toast.error("Failed to create teacher"),
  });

  const csvData = myTeachers.map((m) => ({
    Name: profileMap[m.teacher_id]?.name || "Unknown",
    Email: profileMap[m.teacher_id]?.college_email || "",
    Password: m.current_password,
    "Last Rotation": format(new Date(m.last_rotation_at), "yyyy-MM-dd HH:mm"),
    "Next Rotation": format(new Date(m.next_rotation_at), "yyyy-MM-dd HH:mm"),
  }));

  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <Tabs defaultValue="teachers">
        <TabsList>
          <TabsTrigger value="teachers">My Teachers</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="at-risk">At-Risk Students</TabsTrigger>
        </TabsList>

        <TabsContent value="teachers" className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Create Teacher</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Teacher Account</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>College Email</Label>
                    <Input type="email" value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} />
                  </div>
                  <Button onClick={() => createTeacher.mutate()} disabled={!teacherName || !teacherEmail || createTeacher.isPending}>
                    <Plus className="h-4 w-4 mr-1" /> Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <CSVExportButton data={csvData} filename="my-teachers" />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Last Rotation</TableHead>
                  <TableHead>Next Rotation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myTeachers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">No managed teachers</TableCell>
                  </TableRow>
                ) : myTeachers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{profileMap[m.teacher_id]?.name || "Unknown"}</TableCell>
                    <TableCell className="text-sm">{profileMap[m.teacher_id]?.college_email || ""}</TableCell>
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
          <SessionsTable
            filterTeacherId={teacherIds.length ? undefined : "NONE"}
            onSessionClick={setDrilldown}
          />
          <AttendanceDrilldown session={drilldown} open={!!drilldown} onClose={() => setDrilldown(null)} />
        </TabsContent>

        <TabsContent value="at-risk" className="mt-4">
          <AtRiskStudents collegeId={collegeId || "buc"} teacherIds={teacherIds} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
