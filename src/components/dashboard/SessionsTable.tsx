import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { CSVExportButton } from "./CSVExportButton";
import type { Session } from "@/lib/dashboardTypes";

interface SessionsTableProps {
  filterTeacherId?: string;
  showTeacherName?: boolean;
  onSessionClick?: (session: Session) => void;
  onEndSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

export function SessionsTable({
  filterTeacherId,
  showTeacherName = true,
  onSessionClick,
  onEndSession,
  onDeleteSession,
}: SessionsTableProps) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", filterTeacherId],
    queryFn: async () => {
      let q = (supabase.from as any)("sessions").select("*").order("started_at", { ascending: false });
      if (filterTeacherId) q = q.eq("teacher_id", filterTeacherId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Session[];
    },
  });

  const { data: attendanceCounts = {} } = useQuery({
    queryKey: ["attendance-counts", sessions.map((s) => s.id).join(",")],
    enabled: sessions.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("attendance_records")
        .select("session_id")
        .in("session_id", sessions.map((s) => s.id));
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        counts[r.session_id] = (counts[r.session_id] || 0) + 1;
      });
      return counts;
    },
  });

  const filtered = sessions.filter((s) => {
    const matchSearch = !search || s.course_name.toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || s.started_at.startsWith(dateFilter);
    return matchSearch && matchDate;
  });

  const csvData = filtered.map((s) => ({
    Course: s.course_name,
    Type: s.session_type,
    Group: s.target_group,
    Started: format(new Date(s.started_at), "yyyy-MM-dd HH:mm"),
    Status: s.ended_at ? "Ended" : "Active",
    Attendance: attendanceCounts[s.id] || 0,
  }));

  if (isLoading) return <div className="text-muted-foreground p-4">Loading sessions...</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by course..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="max-w-[180px]"
        />
        <CSVExportButton data={csvData} filename="sessions-export" />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attendance</TableHead>
              {(onEndSession || onDeleteSession) && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No sessions found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((session) => (
                <TableRow
                  key={session.id}
                  className={onSessionClick ? "cursor-pointer" : ""}
                  onClick={() => onSessionClick?.(session)}
                >
                  <TableCell className="font-medium">{session.course_name}</TableCell>
                  <TableCell>
                    <Badge variant={session.session_type === "lecture" ? "default" : "secondary"}>
                      {session.session_type}
                    </Badge>
                  </TableCell>
                  <TableCell>{session.target_group}</TableCell>
                  <TableCell>{format(new Date(session.started_at), "MMM d, HH:mm")}</TableCell>
                  <TableCell>
                    {session.ended_at ? (
                      <Badge variant="secondary">Ended</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>{attendanceCounts[session.id] || 0}</TableCell>
                  {(onEndSession || onDeleteSession) && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {onEndSession && !session.ended_at && (
                          <Button size="sm" variant="outline" onClick={() => onEndSession(session.id)}>
                            End
                          </Button>
                        )}
                        {onDeleteSession && (
                          <Button size="sm" variant="destructive" onClick={() => onDeleteSession(session.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
