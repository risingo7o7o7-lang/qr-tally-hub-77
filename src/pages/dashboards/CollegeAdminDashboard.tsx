import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppRole } from "@/lib/appRoles";
import { ROLE_LABELS } from "@/lib/appRoles";
import Papa from "papaparse";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNowStrict } from "date-fns";

export default function CollegeAdminDashboard() {
  const { collegeId } = useAuth();
  const online = useOnlineStatus();
  const qc = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [search, setSearch] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<AppRole>("student");
  const [bulkCsv, setBulkCsv] = useState("");

  const [studentDbCsv, setStudentDbCsv] = useState("");
  const [studentDbPreview, setStudentDbPreview] = useState<any[] | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["site_settings", collegeId],
    enabled: !!collegeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .eq("college_id", collegeId!);
      if (error) throw error;
      const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));
      return {
        require_email_verification: byKey.get("require_email_verification") ?? "true",
        footer_text: byKey.get("footer_text") ?? "QR Tally",
      };
    },
  });

  const [requireEmailVerification, setRequireEmailVerification] = useState<boolean>(true);
  const [footerText, setFooterText] = useState<string>("QR Tally");

  // Initialize local state once
  useMemo(() => {
    if (!settingsQuery.data) return;
    setRequireEmailVerification(settingsQuery.data.require_email_verification === "true");
    setFooterText(settingsQuery.data.footer_text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.data]);

  const cronQuery = useQuery({
    queryKey: ["cron_health"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cron_health").select("job_name, last_run_at, status, last_status");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const usersQuery = useQuery({
    queryKey: ["users_list", collegeId],
    enabled: !!collegeId,
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, name, college_email, student_id")
        .eq("college_id", collegeId!)
        .limit(1000);
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role, college_id")
        .eq("college_id", collegeId!);
      if (rErr) throw rErr;

      const { data: assignments } = await supabase
        .from("student_group_assignments")
        .select("user_id, group_code, section_code")
        .eq("college_id", collegeId!);
      const assignByUser = new Map((assignments ?? []).map((a) => [a.user_id, a]));

      const { data: stats } = await supabase
        .from("account_stats")
        .select("user_id, total_sessions_created, attendance_rate_percent")
        .in("user_id", (profiles ?? []).map((p) => p.user_id));
      const statsByUser = new Map((stats ?? []).map((s) => [s.user_id, s]));

      const rolesByUser = new Map<string, AppRole[]>();
      for (const r of roles ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        rolesByUser.set(r.user_id, list);
      }

      return (profiles ?? []).map((p) => {
        const roles = rolesByUser.get(p.user_id) ?? [];
        const primary = roles[0] ?? "student";
        const a = assignByUser.get(p.user_id);
        const st = statsByUser.get(p.user_id) as any;
        return {
          ...p,
          role: primary as AppRole,
          group: a ? `${a.group_code} / ${a.section_code}` : null,
          stats: st ?? null,
        };
      });
    },
  });

  const filteredUsers = useMemo(() => {
    const rows = usersQuery.data ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((u: any) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!term) return true;
      return `${u.name} ${u.college_email} ${u.student_id ?? ""}`.toLowerCase().includes(term);
    });
  }, [usersQuery.data, roleFilter, search]);

  const auditQuery = useQuery({
    queryKey: ["audit_logs", collegeId],
    enabled: !!collegeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, event_type, created_at, user_id, session_id, ip_address")
        .eq("college_id", collegeId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const deviceResetsQuery = useQuery({
    queryKey: ["device_resets", collegeId],
    enabled: !!collegeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_reset_requests")
        .select("id, student_id, admin_id, status, reason, created_at, resolved_at")
        .eq("college_id", collegeId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createUser = async () => {
    const { error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "create_user", email: createEmail, name: createName, role: createRole, college_id: collegeId },
    });
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "User created" });
    setCreateEmail("");
    setCreateName("");
    qc.invalidateQueries({ queryKey: ["users_list", collegeId] });
  };

  const bulkImport = async () => {
    const parsed = Papa.parse(bulkCsv, { header: true, skipEmptyLines: true });
    const users = (parsed.data as any[]).map((r) => ({
      email: r.email,
      name: r.name,
      role: r.role,
      student_id: r.student_id,
      college_id: collegeId,
    }));
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "bulk_import", users },
    });
    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Import complete", description: `${data.results?.filter((r: any) => r.status === "ok")?.length ?? 0} created` });
    setBulkCsv("");
    qc.invalidateQueries({ queryKey: ["users_list", collegeId] });
  };

  const parseStudentDb = () => {
    const parsed = Papa.parse(studentDbCsv, { header: true, skipEmptyLines: true });
    const rows = (parsed.data as any[]).map((r) => ({
      student_id: String(r.student_id ?? "").trim(),
      full_name: String(r.full_name ?? "").trim(),
      group_code: String(r.group_code ?? "").trim(),
      section_code: String(r.section_code ?? "").trim(),
      valid:
        /^[A-Z0-9]+$/i.test(String(r.student_id ?? "").trim()) &&
        ["A", "B", "C"].includes(String(r.group_code ?? "").trim()) &&
        /^[ABC](10|[1-9])$/.test(String(r.section_code ?? "").trim()),
    }));
    setStudentDbPreview(rows);
  };

  const importStudentDb = async () => {
    if (!studentDbPreview) return;
    const valid = studentDbPreview.filter((r) => r.valid).map((r) => ({
      student_id: r.student_id,
      full_name: r.full_name,
      group_code: r.group_code,
      section_code: r.section_code,
      college_id: collegeId,
    }));
    const { error } = await supabase.from("external_student_db").upsert(valid, { onConflict: "student_id,college_id,semester_id" });
    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Imported", description: `${valid.length} rows upserted.` });
    setStudentDbCsv("");
    setStudentDbPreview(null);
  };

  const saveSettings = async () => {
    const updates = [
      { key: "require_email_verification", value: requireEmailVerification ? "true" : "false", college_id: collegeId },
      { key: "footer_text", value: footerText, college_id: collegeId },
    ];
    const { error } = await supabase.from("site_settings").upsert(updates, { onConflict: "key" });
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Settings saved" });
    qc.invalidateQueries({ queryKey: ["site_settings", collegeId] });
  };

  return (
    <DashboardLayout title="College Admin Dashboard">
      {!online && <OfflineBanner message="You are offline — some features may be unavailable." />}

      <Tabs defaultValue="users">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="student-db">Student database</TabsTrigger>
          <TabsTrigger value="audit">Audit logs</TabsTrigger>
          <TabsTrigger value="device-resets">Device resets</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Users</CardTitle>
                <div className="flex gap-2">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, student ID" className="w-[260px]" />
                  <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
                    <SelectTrigger className="w-[190px]"><SelectValue placeholder="Role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      {roleFilter === "student" || roleFilter === "all" ? <TableHead>Group</TableHead> : null}
                      <TableHead className="text-right">Stats</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u: any) => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">{u.college_email}</TableCell>
                        <TableCell><Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge></TableCell>
                        {roleFilter === "student" || roleFilter === "all" ? (
                          <TableCell>
                            {u.role !== "student" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : u.group ? (
                              <span className="font-mono text-xs">{u.group}</span>
                            ) : (
                              <Badge className="bg-warning text-warning-foreground">Unassigned</Badge>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right text-muted-foreground">
                          {u.role === "teacher" ? `${u.stats?.total_sessions_created ?? 0} sessions` : u.role === "student" ? `${u.stats?.attendance_rate_percent ?? 0}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!usersQuery.isLoading && filteredUsers.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No users.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create / import</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Create user</div>
                  <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Name" />
                  <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="Email" />
                  <Select value={createRole} onValueChange={(v: any) => setCreateRole(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={createUser} disabled={!online} className="w-full">Create</Button>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Bulk import (CSV)</div>
                  <Textarea value={bulkCsv} onChange={(e) => setBulkCsv(e.target.value)} placeholder="Columns: email,name,role,student_id" rows={6} />
                  <Button onClick={bulkImport} disabled={!online || !bulkCsv.trim()} className="w-full" variant="outline">Import</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Sessions editor is scaffolded here; connect end/delete/editor workflows as needed.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="student-db">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>CSV import</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea value={studentDbCsv} onChange={(e) => setStudentDbCsv(e.target.value)} rows={10} placeholder="Columns: student_id,full_name,group_code,section_code" />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={parseStudentDb} disabled={!studentDbCsv.trim()}>Validate & preview</Button>
                  <Button onClick={importStudentDb} disabled={!online || !(studentDbPreview?.some((r) => r.valid))}>Confirm import</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(studentDbPreview ?? []).slice(0, 8).map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="truncate">{r.student_id} — {r.full_name}</div>
                    {r.valid ? <Badge className="bg-success text-success-foreground">Valid</Badge> : <Badge variant="destructive">Invalid</Badge>}
                  </div>
                ))}
                {!studentDbPreview && <div className="text-sm text-muted-foreground">Run validation to preview rows.</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit logs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(auditQuery.data ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.action}</TableCell>
                      <TableCell className="text-muted-foreground">{a.event_type ?? "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDistanceToNowStrict(new Date(a.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="device-resets">
          <Card>
            <CardHeader>
              <CardTitle>Device resets</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(deviceResetsQuery.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.student_id.slice(0, 8)}…</TableCell>
                      <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">Require email verification</div>
                    <div className="text-sm text-muted-foreground">Controls `require_email_verification` in `site_settings`.</div>
                  </div>
                  <Switch checked={requireEmailVerification} onCheckedChange={setRequireEmailVerification} />
                </div>
                <div className="space-y-1">
                  <Label>Footer text</Label>
                  <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} />
                </div>
                <Button onClick={saveSettings} disabled={!online}>Save</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cron health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(cronQuery.data ?? []).map((j: any) => {
                  const last = j.last_run_at ? new Date(j.last_run_at).getTime() : 0;
                  const stale = last && Date.now() - last > 35 * 60_000;
                  return (
                    <div key={j.job_name} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                      <div className="font-medium">{j.job_name}</div>
                      <div className="flex items-center gap-2">
                        {stale && <Badge variant="destructive">Stale</Badge>}
                        <Badge variant="secondary">{j.status ?? j.last_status ?? "unknown"}</Badge>
                      </div>
                    </div>
                  );
                })}
                {!cronQuery.isLoading && (cronQuery.data?.length ?? 0) === 0 && (
                  <div className="text-sm text-muted-foreground">No cron jobs recorded.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
