import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { OnlineIndicator } from "@/components/dashboard/OnlineIndicator";
import { OfflineBanner } from "@/components/OfflineBanner";
import {
  queueScan, listDueQueuedScans, deleteQueuedScan, updateQueuedScanAttempt,
  putSessionLock, getSessionLock,
} from "@/lib/attendanceIdb";
import { format, subDays, isAfter, startOfDay } from "date-fns";
import {
  QrCode, History, Trophy, Smartphone, Flame, CheckCircle, XCircle, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { LeaderboardEntry } from "@/lib/dashboardTypes";
import { toast } from "sonner";

export default function StudentDashboard() {
  const { t } = useLanguage();
  const { user, collegeId, semesterId } = useAuth();
  const online = useOnlineStatus();
  const [activeTab, setActiveTab] = useState("scan");
  const scannerRef = useRef<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  // ---- QR Scanner ----
  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    setScanning(true);
    setScanResult(null);

    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScan(decodedText),
        () => {},
      );
    } catch (err) {
      console.error("Scanner error:", err);
      setScanResult({ success: false, message: "Camera access denied" });
      setScanning(false);
    }
  }, []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  // ---- Submit attendance ----
  const submitAttendance = async (sessionId: string): Promise<{ success: boolean; message: string }> => {
    // Device session lock check
    const lock = await getSessionLock(sessionId);
    if (lock && lock.studentId !== user!.id) {
      return { success: false, message: "This device has already been used for this session by another account" };
    }

    const { error } = await (supabase.from as any)("attendance_records")
      .insert({ session_id: sessionId, student_id: user!.id, device_fingerprint: navigator.userAgent });

    if (error) {
      if (error.code === "23505") return { success: true, message: "Already recorded!" };
      throw error;
    }

    // Write session lock
    await putSessionLock({ sessionId, studentId: user!.id, lockedAt: new Date().toISOString() });
    return { success: true, message: "Attendance recorded!" };
  };

  const handleScan = async (decodedText: string) => {
    await stopScanner();
    const sessionId = decodedText.trim();

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      setScanResult({ success: false, message: "Invalid QR code" });
      return;
    }

    if (!online) {
      // Queue for later
      await queueScan({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        studentId: user!.id,
        qrToken: sessionId,
        deviceFingerprint: navigator.userAgent,
      });
      setScanResult({ success: true, message: "Saved offline — will sync when online" });
      refreshQueueCount();
      return;
    }

    try {
      const result = await submitAttendance(sessionId);
      setScanResult(result);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } catch (err: any) {
      // Queue on network error
      await queueScan({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        studentId: user!.id,
        qrToken: sessionId,
        deviceFingerprint: navigator.userAgent,
      });
      setScanResult({ success: false, message: "Network error — queued for retry" });
      refreshQueueCount();
    }
  };

  // ---- Offline queue processing ----
  const refreshQueueCount = async () => {
    const due = await listDueQueuedScans(new Date(Date.now() + 999999999).toISOString());
    setQueuedCount(due.length);
  };

  useEffect(() => { refreshQueueCount(); }, []);

  useEffect(() => {
    if (!online || !user) return;
    const processQueue = async () => {
      const due = await listDueQueuedScans(new Date().toISOString());
      for (const scan of due) {
        try {
          const result = await submitAttendance(scan.qrToken);
          if (result.success) {
            await deleteQueuedScan(scan.id);
          } else if (result.message.includes("already been used") || result.message.includes("Invalid")) {
            await deleteQueuedScan(scan.id); // permanent failure
          }
        } catch {
          await updateQueuedScanAttempt(scan.id, scan.attempts + 1, "network_error");
        }
      }
      refreshQueueCount();
    };
    processQueue();
    const interval = setInterval(processQueue, 30000);
    return () => clearInterval(interval);
  }, [online, user]);

  // ---- Attendance History ----
  const { data: history = [] } = useQuery({
    queryKey: ["attendance-history", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("attendance_records")
        .select("id, session_id, scanned_at")
        .eq("student_id", user!.id)
        .order("scanned_at", { ascending: false });
      if (!data?.length) return [];
      const sessionIds = [...new Set(data.map((r: any) => r.session_id))];
      const { data: sessions } = await (supabase.from as any)("sessions")
        .select("id, course_name, session_type, target_group, started_at")
        .in("id", sessionIds);
      const sessionMap = Object.fromEntries((sessions || []).map((s: any) => [s.id, s]));
      return data.map((r: any) => ({ ...r, session: sessionMap[r.session_id] }));
    },
  });

  // ---- 14-day Chart ----
  const chartData = (() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dateStr = format(day, "MMM d");
      const count = history.filter((h: any) => {
        const scanDay = startOfDay(new Date(h.scanned_at));
        return scanDay.getTime() === day.getTime();
      }).length;
      days.push({ date: dateStr, count });
    }
    return days;
  })();

  // ---- Streak ----
  const streak = (() => {
    const uniqueDays = [...new Set(history.map((h: any) => format(new Date(h.scanned_at), "yyyy-MM-dd")))].sort().reverse();
    let count = 0;
    let checkDate = startOfDay(new Date());
    for (const day of uniqueDays) {
      if (day === format(checkDate, "yyyy-MM-dd")) {
        count++;
        checkDate = subDays(checkDate, 1);
      } else break;
    }
    return count;
  })();

  // ---- Leaderboard ----
  const { data: leaderboard = [] } = useQuery({
    queryKey: ["leaderboard", collegeId, semesterId],
    enabled: !!collegeId && !!semesterId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("student_leaderboard", {
        _college_id: collegeId!,
        _semester_id: semesterId!,
        _limit: 50,
      });
      if (error) throw error;
      return (data || []) as LeaderboardEntry[];
    },
  });

  // ---- Device binding ----
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("device_hash, device_bound").eq("user_id", user!.id).single();
      return data;
    },
  });

  const [resetReason, setResetReason] = useState("");
  const submitResetRequest = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("device_reset_requests").insert({
        user_id: user!.id,
        reason: resetReason,
        college_id: collegeId || "buc",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setResetReason("");
      toast.success("Reset request submitted");
    },
  });

  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <div className="flex items-center justify-between mb-4">
        <OnlineIndicator />
        {queuedCount > 0 && (
          <Badge variant="secondary">{queuedCount} queued scan{queuedCount !== 1 ? "s" : ""}</Badge>
        )}
      </div>

      {!online && <OfflineBanner message="You're offline. Scans will be saved and synced when you reconnect." />}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="scan"><QrCode className="h-4 w-4 mr-1" />Scan</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" />History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="leaderboard"><Trophy className="h-4 w-4 mr-1" />Leaderboard</TabsTrigger>
          <TabsTrigger value="device"><Smartphone className="h-4 w-4 mr-1" />Device</TabsTrigger>
        </TabsList>

        <TabsContent value="scan" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-6 flex flex-col items-center gap-4">
              <div id="qr-reader" className="w-full max-w-sm" />
              {!scanning ? (
                <Button onClick={startScanner} size="lg">
                  <QrCode className="h-5 w-5 mr-2" /> Start Scanner
                </Button>
              ) : (
                <Button variant="outline" onClick={stopScanner}>
                  Stop Scanner
                </Button>
              )}
              {scanResult && (
                <div className={`flex items-center gap-2 text-sm ${scanResult.success ? "text-green-600" : "text-destructive"}`}>
                  {scanResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {scanResult.message}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No attendance records</TableCell></TableRow>
                ) : history.map((h: any, i: number) => (
                  <TableRow key={h.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{h.session?.course_name || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{h.session?.session_type || "—"}</Badge></TableCell>
                    <TableCell>{format(new Date(h.scanned_at), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(h.scanned_at), "HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatsCard title="Total Attended" value={history.length} icon={CheckCircle} variant="success" />
            <StatsCard title="Current Streak" value={`${streak} days`} icon={Flame} variant={streak > 0 ? "warning" : "default"} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Last 14 Days</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Sessions Attended</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data yet</TableCell></TableRow>
                ) : leaderboard.map((entry) => (
                  <TableRow key={entry.rank}>
                    <TableCell>
                      {entry.rank <= 3 ? (
                        <span className="text-lg">{["🥇", "🥈", "🥉"][Number(entry.rank) - 1]}</span>
                      ) : entry.rank}
                    </TableCell>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell>{entry.attendance_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="device" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Device Binding Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {profile?.device_bound ? (
                    <Badge variant="default">Bound</Badge>
                  ) : (
                    <Badge variant="secondary">Not bound</Badge>
                  )}
                </span>
              </div>
              {profile?.device_hash && (
                <p className="text-xs text-muted-foreground">Hash: {profile.device_hash.slice(0, 16)}...</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Request Device Reset</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={resetReason} onChange={(e) => setResetReason(e.target.value)} placeholder="e.g. Changed phone" />
              </div>
              <Button
                onClick={() => submitResetRequest.mutate()}
                disabled={!resetReason.trim() || submitResetRequest.isPending}
                size="sm"
              >
                Submit Request
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
