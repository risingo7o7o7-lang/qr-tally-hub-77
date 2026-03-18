import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CSVExportButton } from "./CSVExportButton";
import type { Session } from "@/lib/dashboardTypes";

interface AttendanceDrilldownProps {
  session: Session | null;
  open: boolean;
  onClose: () => void;
}

export function AttendanceDrilldown({ session, open, onClose }: AttendanceDrilldownProps) {
  const { data: records = [] } = useQuery({
    queryKey: ["attendance-drilldown", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("attendance_records")
        .select("*")
        .eq("session_id", session!.id)
        .order("scanned_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-drilldown", records.map((r: any) => r.student_id).join(",")],
    enabled: records.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, name, student_id")
        .in("user_id", records.map((r: any) => r.student_id));
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p]));

  const csvData = records.map((r: any) => ({
    Name: profileMap[r.student_id]?.name || "Unknown",
    "Student ID": profileMap[r.student_id]?.student_id || "",
    "Scanned At": format(new Date(r.scanned_at), "yyyy-MM-dd HH:mm:ss"),
  }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Attendance — {session?.course_name} ({format(new Date(session?.started_at || ""), "MMM d, HH:mm")})
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-between items-center mb-2">
          <Badge variant="secondary">{records.length} students</Badge>
          <CSVExportButton data={csvData} filename={`attendance-${session?.id}`} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead>Scanned At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r: any, i: number) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{profileMap[r.student_id]?.name || "Unknown"}</TableCell>
                <TableCell>{profileMap[r.student_id]?.student_id || "—"}</TableCell>
                <TableCell>{format(new Date(r.scanned_at), "HH:mm:ss")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
