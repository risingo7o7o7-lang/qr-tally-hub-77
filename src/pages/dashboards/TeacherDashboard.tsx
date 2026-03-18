import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { AttendanceDrilldown } from "@/components/dashboard/AttendanceDrilldown";
import { LECTURE_GROUPS, SECTION_GROUPS } from "@/lib/dashboardTypes";
import type { Session } from "@/lib/dashboardTypes";
import { format } from "date-fns";
import {
  Play, Square, QrCode, Maximize, Eye, EyeOff,
  Users, TrendingUp, Clock, BarChart3
} from "lucide-react";
import QRCode from "qrcode";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const QR_ROTATION_SECONDS = 25;

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (seconds / total) * circumference;
  return (
    <svg width="100" height="100" className="absolute -top-2 -right-2">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
      <circle
        cx="50" cy="50" r={radius} fill="none"
        stroke="hsl(var(--primary))" strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        className="transition-all duration-1000"
      />
      <text x="50" y="55" textAnchor="middle" className="fill-foreground text-lg font-bold">{seconds}</text>
    </svg>
  );
}

export default function TeacherDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("session");
  const [drilldownSession, setDrilldownSession] = useState<Session | null>(null);

  // Create session form
  const [courseName, setCourseName] = useState("");
  const [sessionType, setSessionType] = useState<"lecture" | "section">("lecture");
  const [targetGroup, setTargetGroup] = useState("All");
  const [duration, setDuration] = useState("90");

  // Active session state
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [countdown, setCountdown] = useState(QR_ROTATION_SECONDS);
  const [projectionMode, setProjectionMode] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const projectionRef = useRef<HTMLDivElement>(null);

  // Check for existing active session
  const { data: existingSession } = useQuery({
    queryKey: ["active-session", user?.id],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("sessions")
        .select("*")
        .eq("teacher_id", user!.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1);
      return data?.[0] as Session | null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (existingSession && !activeSession) setActiveSession(existingSession);
  }, [existingSession]);

  // Generate QR code
  const generateQr = useCallback(async (sessionId: string) => {
    const url = await QRCode.toDataURL(sessionId, { width: 300, margin: 2 });
    setQrDataUrl(url);
    setCountdown(QR_ROTATION_SECONDS);
  }, []);

  // Countdown timer & rotation
  useEffect(() => {
    if (!activeSession) return;
    generateQr(activeSession.id);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Rotate QR token
          const newToken = crypto.randomUUID();
          (supabase.from as any)("sessions")
            .update({ qr_token: newToken, qr_rotated_at: new Date().toISOString() })
            .eq("id", activeSession.id)
            .then(() => generateQr(activeSession.id));
          return QR_ROTATION_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeSession?.id, generateQr]);

  // Live attendance polling
  const { data: presentStudents = [] } = useQuery({
    queryKey: ["live-attendance", activeSession?.id],
    enabled: !!activeSession?.id,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data: records } = await (supabase.from as any)("attendance_records")
        .select("student_id, scanned_at")
        .eq("session_id", activeSession!.id)
        .order("scanned_at", { ascending: true });
      if (!records?.length) return [];
      const studentIds = records.map((r: any) => r.student_id);
      const { data: profiles } = await supabase.from("profiles")
        .select("user_id, name, student_id").in("user_id", studentIds);
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
      return records.map((r: any) => ({
        ...r,
        name: profileMap[r.student_id]?.name || "Unknown",
        student_code: profileMap[r.student_id]?.student_id || "",
      }));
    },
  });

  // Absent students (from group assignments)
  const { data: absentStudents = [] } = useQuery({
    queryKey: ["absent-students", activeSession?.id, activeSession?.target_group],
    enabled: !!activeSession?.id,
    refetchInterval: 10000,
    queryFn: async () => {
      const session = activeSession!;
      // Get students in the target group
      let q = (supabase.from as any)("student_group_assignments")
        .select("user_id, group_code, section_code")
        .eq("college_id", session.college_id)
        .eq("semester_id", session.semester_id);

      if (session.session_type === "lecture") {
        if (session.target_group !== "All") q = q.eq("group_code", session.target_group);
      } else {
        q = q.eq("section_code", session.target_group);
      }

      const { data: assignments } = await q;
      if (!assignments?.length) return [];

      const presentIds = new Set(presentStudents.map((p: any) => p.student_id));
      const absentUserIds = assignments
        .filter((a: any) => !presentIds.has(a.user_id))
        .map((a: any) => a.user_id);

      if (!absentUserIds.length) return [];

      const { data: profiles } = await supabase.from("profiles")
        .select("user_id, name, student_id").in("user_id", absentUserIds);

      // Check external DB for students without accounts
      const { data: external } = await (supabase.from as any)("external_student_db")
        .select("student_id, full_name")
        .eq("college_id", session.college_id);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

      return absentUserIds.map((uid: string) => {
        const profile = profileMap[uid];
        return {
          user_id: uid,
          name: profile?.name || "Unknown",
          student_id: profile?.student_id || "",
          hasAccount: !!profile,
        };
      });
    },
  });

  // Create session mutation
  const createSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.from as any)("sessions").insert({
        teacher_id: user!.id,
        course_name: courseName,
        session_type: sessionType,
        target_group: targetGroup,
        duration_minutes: parseInt(duration),
      }).select().single();
      if (error) throw error;
      return data as Session;
    },
    onSuccess: (session) => {
      setActiveSession(session);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  // End session mutation
  const endSession = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", activeSession!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveSession(null);
      setQrDataUrl("");
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  // Session analytics
  const { data: analytics = [] } = useQuery({
    queryKey: ["teacher-analytics", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: sessions } = await (supabase.from as any)("sessions")
        .select("id, course_name, started_at")
        .eq("teacher_id", user!.id)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(20);
      if (!sessions?.length) return [];
      const { data: records } = await (supabase.from as any)("attendance_records")
        .select("session_id")
        .in("session_id", sessions.map((s: any) => s.id));
      const counts: Record<string, number> = {};
      (records || []).forEach((r: any) => { counts[r.session_id] = (counts[r.session_id] || 0) + 1; });
      return sessions.map((s: any) => ({
        name: `${s.course_name} (${format(new Date(s.started_at), "MMM d")})`,
        students: counts[s.id] || 0,
      }));
    },
  });

  // Projection mode fullscreen
  const toggleProjection = () => {
    if (!projectionMode && projectionRef.current) {
      projectionRef.current.requestFullscreen?.();
      setProjectionMode(true);
    } else {
      document.exitFullscreen?.();
      setProjectionMode(false);
    }
  };

  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setProjectionMode(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const groups = sessionType === "lecture" ? LECTURE_GROUPS : SECTION_GROUPS;

  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="session">Live Session</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="session" className="space-y-4 mt-4">
          {!activeSession ? (
            <Card>
              <CardHeader><CardTitle>Create New Session</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Course Name</Label>
                    <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Data Structures" />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (minutes)</Label>
                    <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <div className="flex items-center gap-3">
                      <span className={sessionType === "lecture" ? "font-semibold text-foreground" : "text-muted-foreground"}>Lecture</span>
                      <Switch checked={sessionType === "section"} onCheckedChange={(v) => { setSessionType(v ? "section" : "lecture"); setTargetGroup(v ? "A1" : "All"); }} />
                      <span className={sessionType === "section" ? "font-semibold text-foreground" : "text-muted-foreground"}>Section</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Target Group</Label>
                    <Select value={targetGroup} onValueChange={setTargetGroup}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => createSession.mutate()} disabled={!courseName || createSession.isPending}>
                  <Play className="h-4 w-4 mr-1" /> Start Session
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="default" className="text-sm">{activeSession.course_name}</Badge>
                <Badge variant="secondary">{activeSession.session_type} — {activeSession.target_group}</Badge>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => setShowQr(!showQr)}>
                  {showQr ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={toggleProjection}>
                  <Maximize className="h-4 w-4 mr-1" /> Projection
                </Button>
                <Button variant="destructive" size="sm" onClick={() => endSession.mutate()} disabled={endSession.isPending}>
                  <Square className="h-4 w-4 mr-1" /> End Session
                </Button>
              </div>

              <div ref={projectionRef} className={projectionMode ? "fixed inset-0 z-50 bg-background flex items-center justify-center" : ""}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* QR Code */}
                  <Card className="lg:col-span-1">
                    <CardContent className="p-6 flex flex-col items-center relative">
                      <CountdownRing seconds={countdown} total={QR_ROTATION_SECONDS} />
                      {showQr && qrDataUrl ? (
                        <img src={qrDataUrl} alt="QR Code" className="w-64 h-64 mt-6" />
                      ) : (
                        <div className="w-64 h-64 mt-6 bg-muted rounded-lg flex items-center justify-center">
                          <QrCode className="h-16 w-16 text-muted-foreground" />
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">Refreshes every {QR_ROTATION_SECONDS}s</p>
                    </CardContent>
                  </Card>

                  {/* Present */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4 text-green-500" />
                        Present ({presentStudents.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-80 overflow-y-auto">
                      <Table>
                        <TableBody>
                          {presentStudents.map((s: any, i: number) => (
                            <TableRow key={s.student_id}>
                              <TableCell className="py-1.5">{i + 1}</TableCell>
                              <TableCell className="py-1.5 font-medium">{s.name}</TableCell>
                              <TableCell className="py-1.5 text-muted-foreground text-xs">{s.student_code}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Absent */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4 text-destructive" />
                        Absent ({absentStudents.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-80 overflow-y-auto">
                      <Table>
                        <TableBody>
                          {absentStudents.map((s: any, i: number) => (
                            <TableRow key={s.user_id}>
                              <TableCell className="py-1.5">{i + 1}</TableCell>
                              <TableCell className="py-1.5 font-medium">
                                {s.name}
                                {!s.hasAccount && (
                                  <Badge variant="secondary" className="ml-2 text-amber-600 bg-amber-100 dark:bg-amber-900/30">No account</Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-muted-foreground text-xs">{s.student_id}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <SessionsTable filterTeacherId={user?.id} showTeacherName={false} onSessionClick={setDrilldownSession} />
          <AttendanceDrilldown session={drilldownSession} open={!!drilldownSession} onClose={() => setDrilldownSession(null)} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatsCard title="Total Sessions" value={analytics.length} icon={BarChart3} />
            <StatsCard title="Avg Students" value={analytics.length ? Math.round(analytics.reduce((a: number, b: any) => a + b.students, 0) / analytics.length) : 0} icon={Users} />
            <StatsCard title="Peak Hour" value="—" icon={Clock} description="Coming soon" />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Students per Session</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="students" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
