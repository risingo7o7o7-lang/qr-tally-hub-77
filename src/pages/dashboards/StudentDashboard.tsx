import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay, subDays } from "date-fns";
import { Html5Qrcode } from "html5-qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { deleteQueuedScan, getSessionLock, listDueQueuedScans, purgeQueuedScansOlderThan, putSessionLock, queueScan, updateQueuedScanAttempt } from "@/lib/attendanceIdb";
import { toast } from "@/hooks/use-toast";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function getOrCreateDeviceFingerprint() {
  const key = "device_fingerprint_v1";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function parseSessionIdFromToken(token: string) {
  return token.split("|")[0] || null;
}

const PERMANENT_QUEUE_ERRORS = new Set([
  "already_recorded",
  "invalid_signature",
  "invalid_token_format",
  "session_ended",
]);

export default function StudentDashboard() {
  const { user, collegeId, semesterId } = useAuth();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();

  const { canShowInstallBanner, showIosTip, promptInstall, dismiss } = useInstallPrompt("qr_tally_install_banner");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [resetReason, setResetReason] = useState("");

  const deviceFingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("device_bound, device_hash, student_id, name")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["attendance_history", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, submitted_at, attendance_sessions(course_name, session_type, start_time)")
        .eq("student_id", user!.id)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const last14DaysQuery = useQuery({
    queryKey: ["attendance_14d", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const since = subDays(new Date(), 13).toISOString();
      const { data, error } = await supabase
        .from("attendance_records")
        .select("status, submitted_at")
        .eq("student_id", user!.id)
        .gte("submitted_at", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  const leaderboardQuery = useQuery({
    queryKey: ["student_leaderboard"],
    queryFn: async () => {
      // Step 1: fetch recent records (scope to last 90 days to keep it small)
      const since = subDays(new Date(), 90).toISOString();
      const { data, error } = await supabase
        .from("attendance_records")
        .select("student_id")
        .gte("submitted_at", since);
      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
      }

      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([student_id, count]) => ({ student_id, count }));

      if (top.length === 0) return [];

      // Step 2: fetch only needed fields (name) for those users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", top.map((t) => t.student_id));
      if (profilesError) throw profilesError;

      const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.name]));
      return top.map((t, idx) => ({
        rank: idx + 1,
        name: nameById.get(t.student_id) ?? "Unknown",
        count: t.count,
      }));
    },
  });

  const chartData = useMemo(() => {
    const start = subDays(new Date(), 13);
    const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
    const rows = last14DaysQuery.data ?? [];
    return days.map((d) => {
      const present = rows.filter((r) => r.status === "present" && isSameDay(new Date(r.submitted_at), d)).length;
      const suspicious = rows.filter((r) => r.status === "suspicious" && isSameDay(new Date(r.submitted_at), d)).length;
      return { day: format(d, "MM/dd"), present, suspicious };
    });
  }, [last14DaysQuery.data]);

  const streak = useMemo(() => {
    const rows = last14DaysQuery.data ?? [];
    let s = 0;
    for (let i = 0; i < 14; i++) {
      const day = subDays(new Date(), i);
      const any = rows.some((r) => isSameDay(new Date(r.submitted_at), day));
      if (!any) break;
      s++;
    }
    return s;
  }, [last14DaysQuery.data]);

  const submitToken = async (qrToken: string) => {
    const sessionId = parseSessionIdFromToken(qrToken);
    if (!sessionId) {
      toast({ title: "Invalid QR", description: "Could not parse session.", variant: "destructive" });
      return;
    }

    const lock = await getSessionLock(sessionId);
    if (lock && lock.studentId !== user!.id) {
      toast({
        title: "Device locked",
        description: "This device has already been used for this session by another account",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("submit-attendance", {
        body: { qr_token: qrToken, device_fingerprint: deviceFingerprint },
      });

      if (error) throw error;

      if (data?.status === "already_recorded") {
        toast({ title: "Already recorded", description: "You already submitted attendance for this session." });
        await putSessionLock({ sessionId, studentId: user!.id, lockedAt: new Date().toISOString() });
        return;
      }

      if (data?.status === "recorded") {
        toast({ title: "Attendance recorded", description: `Status: ${data.attendance_status}` });
        setLastScan(qrToken);
        await putSessionLock({ sessionId, studentId: user!.id, lockedAt: new Date().toISOString() });
        queryClient.invalidateQueries({ queryKey: ["attendance_history", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["attendance_14d", user?.id] });
        return;
      }

      toast({ title: "Submitted", description: "Your attendance was submitted." });
    } catch (e: any) {
      // Queue on failures (including offline)
      const id = crypto.randomUUID();
      await queueScan({
        id,
        createdAt: new Date().toISOString(),
        studentId: user!.id,
        qrToken,
        deviceFingerprint,
      });
      toast({
        title: "Queued",
        description: online ? "Submission failed; saved for retry." : "Offline; saved for auto-retry.",
      });
    }
  };

  const startScanner = async () => {
    const elId = "qr-reader";
    if (!scannerRef.current) scannerRef.current = new Html5Qrcode(elId);
    setScanning(true);
    await scannerRef.current.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        setScanning(false);
        try {
          await scannerRef.current?.stop();
        } catch {
          // ignore
        }
        await submitToken(decodedText);
      },
      () => {},
    );
  };

  const stopScanner = async () => {
    setScanning(false);
    try {
      await scannerRef.current?.stop();
    } catch {
      // ignore
    }
  };

  // Retry queued scans when online
  useEffect(() => {
    if (!online || !user?.id) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await purgeQueuedScansOlderThan(24 * 60 * 60 * 1000);
      const due = await listDueQueuedScans(new Date().toISOString());
      for (const item of due) {
        if (cancelled) return;
        try {
          const { data, error } = await supabase.functions.invoke("submit-attendance", {
            body: { qr_token: item.qrToken, device_fingerprint: item.deviceFingerprint },
          });
          if (error) throw error;
          if (data?.error && PERMANENT_QUEUE_ERRORS.has(String(data.error))) {
            await deleteQueuedScan(item.id);
            continue;
          }
          if (data?.status === "already_recorded" || data?.status === "recorded") {
            await deleteQueuedScan(item.id);
            queryClient.invalidateQueries({ queryKey: ["attendance_history", user.id] });
            queryClient.invalidateQueries({ queryKey: ["attendance_14d", user.id] });
          } else {
            await updateQueuedScanAttempt(item.id, item.attempts + 1, "unknown_response");
          }
        } catch (e: any) {
          const msg = typeof e?.message === "string" ? e.message : "failed";
          if (PERMANENT_QUEUE_ERRORS.has(msg)) {
            await deleteQueuedScan(item.id);
          } else {
            await updateQueuedScanAttempt(item.id, item.attempts + 1, msg);
          }
        }
      }
    };

    const interval = window.setInterval(tick, 5000);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [online, user?.id, queryClient]);

  const submitResetRequest = async () => {
    if (!user?.id) return;
    const { error } = await supabase.from("device_reset_requests").insert({
      student_id: user.id,
      college_id: collegeId ?? "buc",
      semester_id: semesterId ?? "2025-2026-S2",
      reason: resetReason,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request submitted", description: "An admin will review your device reset request." });
    setResetReason("");
  };

  return (
    <DashboardLayout title="Student Dashboard">
      <div className="overscroll-none">
      {!online && <OfflineBanner message="You are offline — scans will be queued and retried automatically." />}

      {(canShowInstallBanner || showIosTip) && (
        <div className="mb-4 rounded-lg border bg-card px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">Install QR Tally for faster access</div>
              {showIosTip ? (
                <div className="text-muted-foreground">
                  On iOS: tap Share then “Add to Home Screen”.
                </div>
              ) : (
                <div className="text-muted-foreground">Use standalone mode for a better scanning experience.</div>
              )}
            </div>
            <div className="flex gap-2">
              {!showIosTip && <Button onClick={promptInstall}>Install</Button>}
              <Button variant="outline" onClick={dismiss}>Dismiss</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>QR Scanner</CardTitle>
            <Badge variant={online ? "secondary" : "destructive"}>{online ? "Online" : "Offline"}</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              {!scanning ? (
                <Button onClick={startScanner}>Start scanning</Button>
              ) : (
                <Button variant="outline" onClick={stopScanner}>Stop</Button>
              )}
              {lastScan && <Badge variant="outline">Last scan saved</Badge>}
            </div>
            <div className="rounded-lg border bg-muted/30 p-2">
              <div id="qr-reader" className="w-full" />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Device fingerprint: <span className="font-mono">{deviceFingerprint.slice(0, 8)}…</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Binding</div>
              {profileQuery.data?.device_bound ? (
                <Badge className="bg-success text-success-foreground">Bound</Badge>
              ) : (
                <Badge variant="secondary">Not bound</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Student ID: <span className="font-medium text-foreground">{profileQuery.data?.student_id ?? "—"}</span>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Request device reset</div>
              <Input value={resetReason} onChange={(e) => setResetReason(e.target.value)} placeholder="Reason (optional)" />
              <Button onClick={submitResetRequest} disabled={!user}>Submit request</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Attendance analytics (14 days)</CardTitle>
            <Badge variant="secondary">Streak: {streak} days</Badge>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="present" stroke="hsl(var(--success))" fill="hsl(var(--success) / 0.25)" />
                <Area type="monotone" dataKey="suspicious" stroke="hsl(var(--warning))" fill="hsl(var(--warning) / 0.25)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(leaderboardQuery.data ?? []).map((row) => (
                <div key={row.rank} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{row.rank}</Badge>
                    <span className="truncate max-w-[170px]">{row.name}</span>
                  </div>
                  <span className="text-muted-foreground">{row.count}</span>
                </div>
              ))}
              {!leaderboardQuery.isLoading && (leaderboardQuery.data?.length ?? 0) === 0 && (
                <div className="text-sm text-muted-foreground">No data yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="queue">Offline queue</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Attendance history</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(historyQuery.data ?? []).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.attendance_sessions?.course_name ?? "—"}</TableCell>
                        <TableCell>{r.attendance_sessions?.session_type ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={r.status === "present" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{format(new Date(r.submitted_at), "PP p")}</TableCell>
                      </TableRow>
                    ))}
                    {!historyQuery.isLoading && (historyQuery.data?.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No attendance records yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <CardTitle>Offline queue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Failed submissions are stored in IndexedDB and retried on reconnect with backoff (10s → 30s → 60s → 5min → 15min).
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </DashboardLayout>
  );
}
