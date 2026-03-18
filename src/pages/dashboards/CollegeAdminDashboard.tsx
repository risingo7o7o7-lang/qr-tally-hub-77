import { useState, useRef } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { AttendanceDrilldown } from "@/components/dashboard/AttendanceDrilldown";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { format } from "date-fns";
import { Plus, Upload, Users, Shield, BookOpen, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import type { Session, AuditLog, DeviceResetRequest, ExternalStudent } from "@/lib/dashboardTypes";
import type { AppRole } from "@/lib/appRoles";

const ROLE_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Students", value: "student" },
  { label: "Teachers", value: "teacher" },
  { label: "Coordinators", value: "coordinator" },
  { label: "Head Coordinators", value: "head_coordinator" },
  { label: "Module Coordinators", value: "module_coordinator" },
  { label: "College Admins", value: "college_admin" },
];

export default function CollegeAdminDashboard() {
  const { t } = useLanguage();
  const { user, collegeId } = useAuth();
  const queryClient = useQueryClient();
  const [drilldown, setDrilldown] = useState<Session | null>(null);

  // ===== USERS TAB =====
  const [roleFilter, setRoleFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("student");

  const { data: allUsers = [] } = useQuery({
    queryKey: ["admin-users", collegeId],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles")
        .select("user_id, name, college_email, student_id, college_id")
        .eq("college_id", collegeId || "buc");
      const { data: roles } = await supabase.from("user_roles")
        .select("user_id, role")
        .eq("college_id", collegeId || "buc");
      const { data: assignments } = await (supabase.from as any)("student_group_assignments")
        .select("user_id, group_code, section_code")
        .eq("college_id", collegeId || "buc");
      const { data: stats } = await (supabase.from as any)("account_stats")
        .select("*")
        .eq("college_id", collegeId || "buc");

      const roleMap: Record<string, string[]> = {};
      (roles || []).forEach((r) => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });
      const assignMap = Object.fromEntries((assignments || []).map((a: any) => [a.user_id, a]));
      const statsMap = Object.fromEntries((stats || []).map((s: any) => [s.user_id, s]));

      return (profiles || []).map((p) => ({
        ...p,
        roles: roleMap[p.user_id] || [],
        assignment: assignMap[p.user_id],
        stats: statsMap[p.user_id],
      }));
    },
  });

  const filteredUsers = allUsers.filter((u) => {
    const matchRole = roleFilter === "all" || u.roles.includes(roleFilter);
    const matchSearch = !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.college_email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.student_id || "").toLowerCase().includes(userSearch.toLowerCase());
    return matchRole && matchSearch;
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "create_user", email: newUserEmail, name: newUserName, role: newUserRole, college_id: collegeId || "buc" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`User created. Password: ${data.password}`);
      setCreateUserOpen(false);
      setNewUserName(""); setNewUserEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Failed to create user"),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "delete_user", user_id: userId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "change_role", user_id: userId, role, college_id: collegeId || "buc" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  // ===== STUDENT DB TAB =====
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<{ valid: ExternalStudent[]; invalid: string[] } | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const valid: ExternalStudent[] = [];
        const invalid: string[] = [];
        results.data.forEach((row: any, i: number) => {
          if (row.student_id && row.full_name && row.group_code && row.section_code) {
            valid.push({
              id: "", student_id: row.student_id.trim(), full_name: row.full_name.trim(),
              group_code: row.group_code.trim(), section_code: row.section_code.trim(),
              college_id: collegeId || "buc", semester_id: "2025-2026-S2", created_at: "",
            });
          } else {
            invalid.push(`Row ${i + 2}: missing required fields`);
          }
        });
        setCsvPreview({ valid, invalid });
      },
    });
  };

  const confirmImport = useMutation({
    mutationFn: async () => {
      if (!csvPreview?.valid.length) return;
      const rows = csvPreview.valid.map((v) => ({
        student_id: v.student_id, full_name: v.full_name,
        group_code: v.group_code, section_code: v.section_code,
        college_id: v.college_id, semester_id: v.semester_id,
      }));
      const { error } = await (supabase.from as any)("external_student_db").upsert(rows, {
        onConflict: "student_id,college_id,semester_id",
      });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      setImportResult(`${count} students imported successfully`);
      setCsvPreview(null);
      toast.success(`${count} students imported`);
    },
  });

  // ===== AUDIT LOGS TAB =====
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["audit-logs", collegeId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("audit_logs")
        .select("*")
        .eq("college_id", collegeId || "buc")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data || []) as AuditLog[];
    },
  });

  // ===== DEVICE RESETS TAB =====
  const { data: resetRequests = [] } = useQuery({
    queryKey: ["device-resets", collegeId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("device_reset_requests")
        .select("*")
        .eq("college_id", collegeId || "buc")
        .order("created_at", { ascending: false });
      return (data || []) as DeviceResetRequest[];
    },
  });

  const handleResetDecision = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const updates: any = { status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() };
      const { error } = await (supabase.from as any)("device_reset_requests").update(updates).eq("id", id);
      if (error) throw error;
      if (status === "approved") {
        const req = resetRequests.find((r) => r.id === id);
        if (req) {
          await supabase.from("profiles").update({ device_hash: null, device_bound: false } as any).eq("user_id", req.user_id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Decision recorded");
      queryClient.invalidateQueries({ queryKey: ["device-resets"] });
    },
  });

  // ===== SETTINGS TAB =====
  const { data: settings = [] } = useQuery({
    queryKey: ["site-settings", collegeId],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").eq("college_id", collegeId || "buc");
      return data || [];
    },
  });

  const emailVerifSetting = settings.find((s) => s.key === "require_email_verification");
  const footerSetting = settings.find((s) => s.key === "footer_text");
  const [footerText, setFooterText] = useState("");

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.from("site_settings").update({ value, updated_at: new Date().toISOString() })
        .eq("key", key).eq("college_id", collegeId || "buc");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Setting updated");
      queryClient.invalidateQueries({ queryKey: ["site-settings"] });
    },
  });

  const showStudentGroup = roleFilter === "all" || roleFilter === "student";

  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="student-db">Student Database</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="resets">Device Resets</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* USERS */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1 flex-wrap">
              {ROLE_FILTERS.map((r) => (
                <Button key={r.value} variant={roleFilter === r.value ? "default" : "outline"} size="sm"
                  onClick={() => setRoleFilter(r.value)}>{r.label}</Button>
              ))}
            </div>
            <Input placeholder="Search name, email, student ID..." value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)} className="max-w-xs" />
            <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Name</Label><Input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_FILTERS.filter((r) => r.value !== "all").map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => createUser.mutate()} disabled={!newUserName || !newUserEmail || createUser.isPending}>Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {showStudentGroup && <TableHead>Group</TableHead>}
                  <TableHead>Stats</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No users</TableCell></TableRow>
                ) : filteredUsers.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm">{u.college_email}</TableCell>
                    <TableCell>
                      {u.roles.map((r: string) => <Badge key={r} variant="secondary" className="mr-1 text-xs">{r}</Badge>)}
                    </TableCell>
                    {showStudentGroup && (
                      <TableCell>
                        {u.assignment ? (
                          <span className="text-sm">{u.assignment.group_code} / {u.assignment.section_code}</span>
                        ) : u.roles.includes("student") ? (
                          <Badge variant="secondary" className="text-amber-600 bg-amber-100 dark:bg-amber-900/30">Unassigned</Badge>
                        ) : null}
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">
                      {u.roles.includes("teacher") && u.stats ? `${u.stats.session_count} sessions` : ""}
                      {u.roles.includes("student") && u.stats ? `${u.stats.attendance_count} attended` : ""}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Select onValueChange={(role) => changeRole.mutate({ userId: u.user_id, role: role as AppRole })}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Change role" /></SelectTrigger>
                          <SelectContent>
                            {ROLE_FILTERS.filter((r) => r.value !== "all").map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="destructive" className="h-7 text-xs"
                          onClick={() => { if (confirm("Delete this user?")) deleteUser.mutate(u.user_id); }}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* SESSIONS */}
        <TabsContent value="sessions" className="mt-4">
          <SessionsTable
            onSessionClick={setDrilldown}
            onEndSession={(id) => (supabase.from as any)("sessions").update({ ended_at: new Date().toISOString() }).eq("id", id).then(() => queryClient.invalidateQueries({ queryKey: ["sessions"] }))}
            onDeleteSession={(id) => { if (confirm("Delete?")) (supabase.from as any)("sessions").delete().eq("id", id).then(() => queryClient.invalidateQueries({ queryKey: ["sessions"] })); }}
          />
          <AttendanceDrilldown session={drilldown} open={!!drilldown} onClose={() => setDrilldown(null)} />
        </TabsContent>

        {/* STUDENT DB */}
        <TabsContent value="student-db" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Import Students from CSV</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Format: student_id, full_name, group_code, section_code</p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Choose CSV
              </Button>
              {csvPreview && (
                <div className="space-y-2">
                  <p className="text-sm text-green-600">{csvPreview.valid.length} valid rows</p>
                  {csvPreview.invalid.length > 0 && (
                    <div className="text-xs text-destructive space-y-0.5">
                      {csvPreview.invalid.slice(0, 5).map((msg, i) => <p key={i}>{msg}</p>)}
                    </div>
                  )}
                  <div className="rounded-md border max-h-48 overflow-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Student ID</TableHead><TableHead>Name</TableHead>
                        <TableHead>Group</TableHead><TableHead>Section</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {csvPreview.valid.slice(0, 10).map((v, i) => (
                          <TableRow key={i}>
                            <TableCell>{v.student_id}</TableCell><TableCell>{v.full_name}</TableCell>
                            <TableCell>{v.group_code}</TableCell><TableCell>{v.section_code}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button size="sm" onClick={() => confirmImport.mutate()} disabled={confirmImport.isPending}>
                    Confirm Import ({csvPreview.valid.length} rows)
                  </Button>
                </div>
              )}
              {importResult && <p className="text-sm text-green-600">{importResult}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUDIT LOGS */}
        <TabsContent value="audit" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead><TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{format(new Date(log.created_at), "MMM d, HH:mm:ss")}</TableCell>
                    <TableCell><Badge variant="secondary">{log.action}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {JSON.stringify(log.details)}
                    </TableCell>
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
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead><TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resetRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="text-sm">{req.user_id.slice(0, 8)}...</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{req.reason}</TableCell>
                    <TableCell>
                      <Badge variant={req.status === "approved" ? "default" : req.status === "rejected" ? "destructive" : "secondary"}>
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{format(new Date(req.created_at), "MMM d, HH:mm")}</TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" className="h-7 text-xs"
                            onClick={() => handleResetDecision.mutate({ id: req.id, status: "approved" })}>Approve</Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs"
                            onClick={() => handleResetDecision.mutate({ id: req.id, status: "rejected" })}>Reject</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Email Verification</p>
                  <p className="text-xs text-muted-foreground">Require new users to verify email</p>
                </div>
                <Switch
                  checked={emailVerifSetting?.value === "true"}
                  onCheckedChange={(v) => updateSetting.mutate({ key: "require_email_verification", value: v ? "true" : "false" })}
                />
              </div>
              <div className="space-y-2">
                <Label>Footer Text</Label>
                <div className="flex gap-2">
                  <Input
                    value={footerText || footerSetting?.value || ""}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="QR Tally"
                  />
                  <Button size="sm" onClick={() => updateSetting.mutate({ key: "footer_text", value: footerText })}>Save</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
