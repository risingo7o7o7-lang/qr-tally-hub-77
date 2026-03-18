import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { AttendanceDrilldown } from "@/components/dashboard/AttendanceDrilldown";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import { format } from "date-fns";
import { Plus, Building2, Calendar, Globe, Users, BookOpen } from "lucide-react";
import { toast } from "sonner";
import type { Session, AuditLog, DeviceResetRequest } from "@/lib/dashboardTypes";
import type { AppRole } from "@/lib/appRoles";

const ROLE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Students", value: "student" },
  { label: "Teachers", value: "teacher" },
  { label: "Coordinators", value: "coordinator" },
  { label: "Head Coordinators", value: "head_coordinator" },
  { label: "Module Coordinators", value: "module_coordinator" },
  { label: "College Admins", value: "college_admin" },
  { label: "Super Admins", value: "super_admin" },
];

export default function SuperAdminDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [drilldown, setDrilldown] = useState<Session | null>(null);

  // ===== COLLEGES =====
  const { data: colleges = [] } = useQuery({
    queryKey: ["colleges"],
    queryFn: async () => {
      const { data } = await supabase.from("colleges").select("*").order("name");
      return data || [];
    },
  });

  const [newCollegeId, setNewCollegeId] = useState("");
  const [newCollegeName, setNewCollegeName] = useState("");
  const [newCollegeDomain, setNewCollegeDomain] = useState("");
  const [addCollegeOpen, setAddCollegeOpen] = useState(false);

  const addCollege = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("colleges").insert({
        id: newCollegeId, name: newCollegeName, domain: newCollegeDomain,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("College added");
      setAddCollegeOpen(false);
      setNewCollegeId(""); setNewCollegeName(""); setNewCollegeDomain("");
      queryClient.invalidateQueries({ queryKey: ["colleges"] });
    },
  });

  // ===== SEMESTERS =====
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters"],
    queryFn: async () => {
      const { data } = await supabase.from("semesters").select("*").order("start_date", { ascending: false });
      return data || [];
    },
  });

  const [newSemId, setNewSemId] = useState("");
  const [newSemName, setNewSemName] = useState("");
  const [newSemCollege, setNewSemCollege] = useState("buc");
  const [newSemStart, setNewSemStart] = useState("");
  const [newSemEnd, setNewSemEnd] = useState("");
  const [addSemOpen, setAddSemOpen] = useState(false);

  const addSemester = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("semesters").insert({
        id: newSemId, name: newSemName, college_id: newSemCollege,
        start_date: newSemStart, end_date: newSemEnd,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Semester added");
      setAddSemOpen(false);
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });

  const toggleSemActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("semesters").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["semesters"] }),
  });

  // ===== USERS (cross-college) =====
  const [roleFilter, setRoleFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");

  const { data: allUsers = [] } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles")
        .select("user_id, name, college_email, student_id, college_id");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role, college_id");
      const roleMap: Record<string, string[]> = {};
      (roles || []).forEach((r) => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });
      return (profiles || []).map((p) => ({ ...p, roles: roleMap[p.user_id] || [] }));
    },
  });

  const filteredUsers = allUsers.filter((u) => {
    const matchRole = roleFilter === "all" || u.roles.includes(roleFilter);
    const matchSearch = !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.college_email.toLowerCase().includes(userSearch.toLowerCase());
    return matchRole && matchSearch;
  });

  // ===== CROSS-COLLEGE STATS =====
  const { data: stats } = useQuery({
    queryKey: ["cross-college-stats"],
    queryFn: async () => {
      const { count: totalUsers } = await supabase.from("profiles").select("id", { head: true, count: "exact" });
      const { count: totalSessions } = await (supabase.from as any)("sessions").select("id", { head: true, count: "exact" });
      const { count: totalRecords } = await (supabase.from as any)("attendance_records").select("id", { head: true, count: "exact" });
      return { totalUsers: totalUsers || 0, totalSessions: totalSessions || 0, totalRecords: totalRecords || 0 };
    },
  });

  // ===== AUDIT & DEVICE RESETS =====
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["super-audit-logs"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("audit_logs")
        .select("*").order("created_at", { ascending: false }).limit(100);
      return (data || []) as AuditLog[];
    },
  });

  const { data: resetRequests = [] } = useQuery({
    queryKey: ["super-device-resets"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("device_reset_requests")
        .select("*").order("created_at", { ascending: false });
      return (data || []) as DeviceResetRequest[];
    },
  });

  const handleResetDecision = useMutation({
    mutationFn: async ({ id, status, userId }: { id: string; status: string; userId: string }) => {
      await (supabase.from as any)("device_reset_requests").update({
        status, reviewed_by: user!.id, reviewed_at: new Date().toISOString(),
      }).eq("id", id);
      if (status === "approved") {
        await supabase.from("profiles").update({ device_hash: null, device_bound: false } as any).eq("user_id", userId);
      }
    },
    onSuccess: () => {
      toast.success("Done");
      queryClient.invalidateQueries({ queryKey: ["super-device-resets"] });
    },
  });

  return (
    <DashboardLayout title={t("nav.dashboard")}>
      {/* Stats overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <StatsCard title="Colleges" value={colleges.length} icon={Building2} />
        <StatsCard title="Total Users" value={stats?.totalUsers || 0} icon={Users} />
        <StatsCard title="Total Sessions" value={stats?.totalSessions || 0} icon={BookOpen} />
        <StatsCard title="Total Records" value={stats?.totalRecords || 0} icon={Globe} />
      </div>

      <Tabs defaultValue="colleges">
        <TabsList className="flex-wrap">
          <TabsTrigger value="colleges">Colleges</TabsTrigger>
          <TabsTrigger value="semesters">Semesters</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="resets">Device Resets</TabsTrigger>
        </TabsList>

        {/* COLLEGES */}
        <TabsContent value="colleges" className="mt-4 space-y-3">
          <Dialog open={addCollegeOpen} onOpenChange={setAddCollegeOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add College</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add College</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>ID (short code)</Label><Input value={newCollegeId} onChange={(e) => setNewCollegeId(e.target.value)} placeholder="buc" /></div>
                <div className="space-y-2"><Label>Name</Label><Input value={newCollegeName} onChange={(e) => setNewCollegeName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Domain</Label><Input value={newCollegeDomain} onChange={(e) => setNewCollegeDomain(e.target.value)} placeholder="buc.edu.eg" /></div>
                <Button onClick={() => addCollege.mutate()} disabled={!newCollegeId || !newCollegeName || !newCollegeDomain}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Domain</TableHead><TableHead>Created</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {colleges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.id}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.domain}</TableCell>
                    <TableCell className="text-xs">{format(new Date(c.created_at), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* SEMESTERS */}
        <TabsContent value="semesters" className="mt-4 space-y-3">
          <Dialog open={addSemOpen} onOpenChange={setAddSemOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Semester</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Semester</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>ID</Label><Input value={newSemId} onChange={(e) => setNewSemId(e.target.value)} placeholder="2025-2026-S2" /></div>
                <div className="space-y-2"><Label>Name</Label><Input value={newSemName} onChange={(e) => setNewSemName(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>College</Label>
                  <Select value={newSemCollege} onValueChange={setNewSemCollege}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{colleges.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={newSemStart} onChange={(e) => setNewSemStart(e.target.value)} /></div>
                  <div className="space-y-2"><Label>End Date</Label><Input type="date" value={newSemEnd} onChange={(e) => setNewSemEnd(e.target.value)} /></div>
                </div>
                <Button onClick={() => addSemester.mutate()} disabled={!newSemId || !newSemName || !newSemStart || !newSemEnd}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>College</TableHead>
                <TableHead>Dates</TableHead><TableHead>Active</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {semesters.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.college_id}</TableCell>
                    <TableCell className="text-xs">{s.start_date} → {s.end_date}</TableCell>
                    <TableCell>
                      <Switch checked={s.is_active} onCheckedChange={(v) => toggleSemActive.mutate({ id: s.id, active: v })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* USERS */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {ROLE_FILTERS.map((r) => (
              <Button key={r.value} variant={roleFilter === r.value ? "default" : "outline"} size="sm"
                onClick={() => setRoleFilter(r.value)}>{r.label}</Button>
            ))}
            <Input placeholder="Search..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="max-w-xs" />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>College</TableHead><TableHead>Roles</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredUsers.slice(0, 100).map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm">{u.college_email}</TableCell>
                    <TableCell className="text-xs">{u.college_id}</TableCell>
                    <TableCell>{u.roles.map((r: string) => <Badge key={r} variant="secondary" className="mr-1 text-xs">{r}</Badge>)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* SESSIONS */}
        <TabsContent value="sessions" className="mt-4">
          <SessionsTable onSessionClick={setDrilldown} />
          <AttendanceDrilldown session={drilldown} open={!!drilldown} onClose={() => setDrilldown(null)} />
        </TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>College</TableHead><TableHead>Details</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{format(new Date(log.created_at), "MMM d, HH:mm:ss")}</TableCell>
                    <TableCell><Badge variant="secondary">{log.action}</Badge></TableCell>
                    <TableCell className="text-xs">{log.college_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{JSON.stringify(log.details)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* DEVICE RESETS */}
        <TabsContent value="resets" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>User</TableHead><TableHead>Reason</TableHead><TableHead>College</TableHead>
                <TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {resetRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="text-xs">{req.user_id.slice(0, 8)}...</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{req.reason}</TableCell>
                    <TableCell className="text-xs">{req.college_id}</TableCell>
                    <TableCell>
                      <Badge variant={req.status === "approved" ? "default" : req.status === "rejected" ? "destructive" : "secondary"}>{req.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{format(new Date(req.created_at), "MMM d, HH:mm")}</TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleResetDecision.mutate({ id: req.id, status: "approved", userId: req.user_id })}>Approve</Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleResetDecision.mutate({ id: req.id, status: "rejected", userId: req.user_id })}>Reject</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
