import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CSVExportButton } from "./CSVExportButton";

interface AtRiskStudentsProps {
  collegeId?: string;
  semesterId?: string;
  /** Filter to only sessions from specific teacher IDs */
  teacherIds?: string[];
}

export function AtRiskStudents({ collegeId = "buc", semesterId = "2025-2026-S2", teacherIds }: AtRiskStudentsProps) {
  const { data: atRisk = [], isLoading } = useQuery({
    queryKey: ["at-risk-students", collegeId, semesterId, teacherIds?.join(",")],
    queryFn: async () => {
      // Get total sessions count
      let sessionsQ = (supabase.from as any)("sessions")
        .select("id")
        .eq("college_id", collegeId)
        .eq("semester_id", semesterId)
        .not("ended_at", "is", null);
      if (teacherIds?.length) sessionsQ = sessionsQ.in("teacher_id", teacherIds);
      const { data: sessions } = await sessionsQ;
      const totalSessions = sessions?.length || 0;
      if (totalSessions === 0) return [];

      const sessionIds = (sessions || []).map((s: any) => s.id);

      // Get attendance records for those sessions
      const { data: records } = await (supabase.from as any)("attendance_records")
        .select("student_id")
        .in("session_id", sessionIds);

      // Count per student
      const counts: Record<string, number> = {};
      (records || []).forEach((r: any) => {
        counts[r.student_id] = (counts[r.student_id] || 0) + 1;
      });

      // Get all students in the college
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, student_id, college_email")
        .eq("college_id", collegeId);

      // Get student roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student")
        .eq("college_id", collegeId);

      const studentUserIds = new Set((roles || []).map((r) => r.user_id));

      return (profiles || [])
        .filter((p) => studentUserIds.has(p.user_id))
        .map((p) => {
          const attended = counts[p.user_id] || 0;
          const rate = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;
          return {
            user_id: p.user_id,
            name: p.name,
            student_id: p.student_id,
            email: p.college_email,
            attended,
            total: totalSessions,
            rate,
          };
        })
        .filter((s) => s.rate < 75)
        .sort((a, b) => a.rate - b.rate);
    },
  });

  const csvData = atRisk.map((s) => ({
    Name: s.name,
    "Student ID": s.student_id || "",
    Email: s.email,
    Attended: s.attended,
    Total: s.total,
    "Rate %": s.rate,
  }));

  if (isLoading) return <div className="text-muted-foreground p-4">Loading...</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-muted-foreground">
          Students below 75% attendance ({atRisk.length})
        </h3>
        <CSVExportButton data={csvData} filename="at-risk-students" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead>Attended</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {atRisk.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No at-risk students
                </TableCell>
              </TableRow>
            ) : (
              atRisk.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.student_id || "—"}</TableCell>
                  <TableCell>{s.attended}</TableCell>
                  <TableCell>{s.total}</TableCell>
                  <TableCell>
                    <Badge variant="destructive">{s.rate}%</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
