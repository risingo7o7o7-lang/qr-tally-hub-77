import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import QRCode from "qrcode";

type SessionType = "lecture" | "section";

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TeacherDashboard() {
  const { user, collegeId, semesterId } = useAuth();
  const online = useOnlineStatus();
  const { canShowInstallBanner, showIosTip, promptInstall, dismiss } = useInstallPrompt("qr_tally_install_banner_teacher");

  const [courseName, setCourseName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [isSection, setIsSection] = useState(false);
  const [targetGroup, setTargetGroup] = useState<"A" | "B" | "C" | "all">("all");
  const [targetSection, setTargetSection] = useState<string>("");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [projectionMode, setProjectionMode] = useState(false);
  const [hideQr, setHideQr] = useState(false);

  const countdownRef = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const refreshQr = async (sessionId: string) => {
    const { data, error } = await supabase.functions.invoke("refresh-qr", { body: { session_id: sessionId } });
    if (error) throw error;
    setQrToken(data.token);
    setQrExpiresAt(data.expires_at);
    setSecondsLeft(25);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!qrToken) {
        setQrDataUrl(null);
        return;
      }
      try {
        const url = await QRCode.toDataURL(qrToken, { margin: 1, width: 360 });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  const createSession = async () => {
    if (!user?.id) return;
    if (!courseName.trim()) {
      toast({ title: "Course name required", variant: "destructive" });
      return;
    }

    const session_type: SessionType = isSection ? "section" : "lecture";
    const { data, error } = await supabase
      .from("attendance_sessions")
      .insert({
        teacher_id: user.id,
        college_id: collegeId ?? "buc",
        semester_id: semesterId ?? "2025-2026-S2",
        course_name: courseName.trim(),
        session_type,
        duration_minutes: durationMinutes,
        target_group: session_type === "lecture" ? targetGroup : null,
        target_section: session_type === "section" ? targetSection : null,
        refresh_interval: 25,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Failed to create session", description: error.message, variant: "destructive" });
      return;
    }

    setActiveSessionId(data.id);
    toast({ title: "Session created", description: "QR will start refreshing automatically." });
    await refreshQr(data.id);
  };

  const endSession = async () => {
    if (!activeSessionId) return;
    const { data, error } = await supabase.functions.invoke("end-session", { body: { session_id: activeSessionId } });
    if (error) {
      toast({ title: "Failed to end session", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Session ended" });
    setActiveSessionId(null);
    setQrToken(null);
    setQrExpiresAt(null);
  };

  // Rotating countdown ring
  useEffect(() => {
    if (!activeSessionId || !qrExpiresAt) return;

    if (countdownRef.current) window.clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        const next = Math.max(0, s - 1);
        return next;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    };
  }, [activeSessionId, qrExpiresAt]);

  // Auto-refresh when token expires / countdown hits 0
  useEffect(() => {
    if (!activeSessionId) return;
    if (secondsLeft !== 0) return;
    if (!online) return;
    refreshQr(activeSessionId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, activeSessionId, online]);

  const presentQuery = useQuery({
    queryKey: ["present_records", activeSessionId],
    enabled: !!activeSessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, submitted_at, student_id")
        .eq("session_id", activeSessionId!)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: activeSessionId ? 3000 : false,
  });

  const sessionQuery = useQuery({
    queryKey: ["teacher_session", activeSessionId],
    enabled: !!activeSessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_sessions")
        .select("id, course_name, session_type, target_group, target_section, start_time, duration_minutes, grace_period_minutes, college_id, semester_id, status")
        .eq("id", activeSessionId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const absentQuery = useQuery({
    queryKey: ["absent_list", activeSessionId],
    enabled: !!activeSessionId && !!sessionQuery.data,
    queryFn: async () => {
      const session = sessionQuery.data!;

      const presentStudentIds = new Set((presentQuery.data ?? []).map((r) => r.student_id));

      // Fetch eligible students from assignments / external db
      if (session.session_type === "lecture") {
        const group = (session.target_group ?? "all") as any;
        const { data: assigned, error } = await supabase
          .from("student_group_assignments")
          .select("student_id, group_code, section_code, user_id")
          .eq("college_id", session.college_id)
          .eq("semester_id", session.semester_id)
          .in("group_code", group === "all" ? ["A", "B", "C"] : [group]);
        if (error) throw error;

        // Fetch names for those with accounts
        const userIds = (assigned ?? []).map((a) => a.user_id);
        const { data: profiles } = userIds.length
          ? await supabase.from("profiles").select("user_id, name, student_id").in("user_id", userIds)
          : { data: [] as any[] };
        const byUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));

        // For "no account" lookups, query external db names by student_id
        const studentIds = (assigned ?? []).map((a) => a.student_id);
        const { data: ext } = studentIds.length
          ? await supabase
              .from("external_student_db")
              .select("student_id, full_name")
              .eq("college_id", session.college_id)
              .eq("semester_id", session.semester_id)
              .in("student_id", studentIds)
          : { data: [] as any[] };
        const extBySid = new Map((ext ?? []).map((e) => [e.student_id, e.full_name]));

        return (assigned ?? [])
          .filter((a) => {
            const profile = byUser.get(a.user_id);
            if (profile && presentStudentIds.has(profile.user_id)) return false;
            // If profile missing, can't be present (no account record), keep as absent
            if (profile && presentStudentIds.has(a.user_id)) return false;
            return !presentStudentIds.has(a.user_id);
          })
          .map((a) => {
            const p = byUser.get(a.user_id);
            return {
              student_id: a.student_id,
              name: p?.name ?? extBySid.get(a.student_id) ?? "Unknown",
              hasAccount: !!p,
            };
          });
      }

      // section session: filter by target_section
      const section = session.target_section;
      const { data: assigned, error } = await supabase
        .from("student_group_assignments")
        .select("student_id, section_code, user_id")
        .eq("college_id", session.college_id)
        .eq("semester_id", session.semester_id)
        .eq("section_code", section);
      if (error) throw error;

      const userIds = (assigned ?? []).map((a) => a.user_id);
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, name, student_id").in("user_id", userIds)
        : { data: [] as any[] };
      const byUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      const studentIds = (assigned ?? []).map((a) => a.student_id);
      const { data: ext } = studentIds.length
        ? await supabase
            .from("external_student_db")
            .select("student_id, full_name")
            .eq("college_id", session.college_id)
            .eq("semester_id", session.semester_id)
            .in("student_id", studentIds)
        : { data: [] as any[] };
      const extBySid = new Map((ext ?? []).map((e) => [e.student_id, e.full_name]));

      return (assigned ?? [])
        .filter((a) => !presentStudentIds.has(a.user_id))
        .map((a) => {
          const p = byUser.get(a.user_id);
          return { student_id: a.student_id, name: p?.name ?? extBySid.get(a.student_id) ?? "Unknown", hasAccount: !!p };
        });
    },
    refetchInterval: activeSessionId ? 5000 : false,
  });

  const sectionOptions = useMemo(() => {
    const groups = ["A", "B", "C"];
    const opts: string[] = [];
    for (const g of groups) for (let i = 1; i <= 10; i++) opts.push(`${g}${i}`);
    return opts;
  }, []);

  const progress = useMemo(() => (secondsLeft / 25) * 100, [secondsLeft]);

  const exportSessionCsv = async () => {
    if (!activeSessionId) return;
    const { data, error } = await supabase
      .from("attendance_records")
      .select("student_id, status, submitted_at")
      .eq("session_id", activeSessionId)
      .order("submitted_at", { ascending: true });
    if (error) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
      return;
    }
    downloadCsv(`session-${activeSessionId}.csv`, data ?? []);
  };

  const toggleProjection = async () => {
    setProjectionMode((v) => !v);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore
    }
  };

  return (
    <DashboardLayout title="Teacher Dashboard">
      <div className="overscroll-none">
      {!online && <OfflineBanner message="You are offline — some live features may be unavailable." />}

      {(canShowInstallBanner || showIosTip) && (
        <div className="mb-4 rounded-lg border bg-card px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">Install QR Tally for faster access</div>
              {showIosTip ? (
                <div className="text-muted-foreground">On iOS: tap Share then “Add to Home Screen”.</div>
              ) : (
                <div className="text-muted-foreground">Standalone mode is ideal for projection.</div>
              )}
            </div>
            <div className="flex gap-2">
              {!showIosTip && <Button onClick={promptInstall}>Install</Button>}
              <Button variant="outline" onClick={dismiss}>Dismiss</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Create session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Course name</Label>
              <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Data Structures" />
            </div>
            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value || 15))} min={1} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-2">
              <div>
                <div className="text-sm font-medium">Section session</div>
                <div className="text-xs text-muted-foreground">{isSection ? "Section" : "Lecture"}</div>
              </div>
              <Switch checked={isSection} onCheckedChange={setIsSection} />
            </div>

            {!isSection ? (
              <div className="space-y-1">
                <Label>Target group</Label>
                <Select value={targetGroup} onValueChange={(v: any) => setTargetGroup(v)}>
                  <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Target section</Label>
                <Select value={targetSection} onValueChange={setTargetSection}>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!activeSessionId ? (
              <Button onClick={createSession} className="w-full" disabled={!online}>Create & start</Button>
            ) : (
              <div className="space-y-2">
                <Button variant="destructive" onClick={endSession} className="w-full">End session</Button>
                <Button variant="outline" onClick={() => refreshQr(activeSessionId)} className="w-full" disabled={!online}>Refresh QR now</Button>
                <Button variant="outline" onClick={exportSessionCsv} className="w-full">Export CSV</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Live QR</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={toggleProjection}>Projection</Button>
              <Button variant="outline" onClick={() => setHideQr((v) => !v)}>{hideQr ? "Show QR" : "Hide QR"}</Button>
            </div>
          </CardHeader>
          <CardContent>
            {!activeSessionId ? (
              <div className="text-sm text-muted-foreground">Create a session to start.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{sessionQuery.data?.course_name}</div>
                    <Badge variant="secondary">{sessionQuery.data?.session_type}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Started: {sessionQuery.data?.start_time ? format(new Date(sessionQuery.data.start_time), "PP p") : "—"}
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Rotates every 25s</span>
                      <span>{secondsLeft}s</span>
                    </div>
                    <Progress value={progress} className="mt-1" />
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  {hideQr ? (
                    <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                      QR hidden
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">QR payload (scan on student device)</div>
                      <div className="grid gap-3 md:grid-cols-2 items-start">
                        <div className="rounded-md bg-muted p-2 font-mono text-xs break-all">
                          {qrToken ?? "Loading..."}
                        </div>
                        <div className="flex items-center justify-center rounded-md border bg-card p-2">
                          {qrDataUrl ? (
                            <img src={qrDataUrl} alt="QR code" className="h-[180px] w-[180px]" />
                          ) : (
                            <div className="h-[180px] w-[180px] flex items-center justify-center text-xs text-muted-foreground">
                              Generating…
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Expires: {qrExpiresAt ? format(new Date(qrExpiresAt), "p") : "—"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Present</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(presentQuery.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.student_id.slice(0, 8)}…</TableCell>
                    <TableCell>
                      <Badge className={r.status === "present" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{format(new Date(r.submitted_at), "p")}</TableCell>
                  </TableRow>
                ))}
                {!presentQuery.isLoading && (presentQuery.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No scans yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Absent</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead className="text-right">Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(absentQuery.data ?? []).map((s: any) => (
                  <TableRow key={s.student_id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.student_id}</TableCell>
                    <TableCell className="text-right">
                      {s.hasAccount ? <Badge variant="secondary">OK</Badge> : <Badge className="bg-warning text-warning-foreground">No account</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {!absentQuery.isLoading && (absentQuery.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No absent list yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {projectionMode && (
        <div className="mt-6 text-xs text-muted-foreground">
          Projection mode is on. If fullscreen is not available, use your browser’s fullscreen shortcut.
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
