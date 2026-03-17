import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export default function SuperAdminDashboard() {
  const online = useOnlineStatus();
  const qc = useQueryClient();

  const collegesQuery = useQuery({
    queryKey: ["colleges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("colleges").select("id, name, domain, created_at").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const semestersQuery = useQuery({
    queryKey: ["semesters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("semesters").select("id, name, college_id, start_date, end_date, is_active").order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [newCollegeId, setNewCollegeId] = useState("");
  const [newCollegeName, setNewCollegeName] = useState("");
  const [newCollegeDomain, setNewCollegeDomain] = useState("");

  const addCollege = async () => {
    const { error } = await supabase.from("colleges").insert({ id: newCollegeId, name: newCollegeName, domain: newCollegeDomain });
    if (error) {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "College added" });
    setNewCollegeId("");
    setNewCollegeName("");
    setNewCollegeDomain("");
    qc.invalidateQueries({ queryKey: ["colleges"] });
  };

  return (
    <DashboardLayout title="Super Admin Dashboard">
      {!online && <OfflineBanner message="You are offline — some features may be unavailable." />}

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="colleges">Colleges</TabsTrigger>
          <TabsTrigger value="semesters">Semesters</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Cross-college stats overview</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Overview scaffolding is ready. Add KPIs (sessions, attendance rate, at-risk count) as needed.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="colleges">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Colleges</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Domain</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(collegesQuery.data ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.id}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.domain}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add college</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input value={newCollegeId} onChange={(e) => setNewCollegeId(e.target.value)} placeholder="id (e.g. buc)" />
                <Input value={newCollegeName} onChange={(e) => setNewCollegeName(e.target.value)} placeholder="name" />
                <Input value={newCollegeDomain} onChange={(e) => setNewCollegeDomain(e.target.value)} placeholder="domain (e.g. buc.edu.eg)" />
                <Button onClick={addCollege} disabled={!online} className="w-full">Add</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="semesters">
          <Card>
            <CardHeader>
              <CardTitle>Semesters</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(semestersQuery.data ?? []).map((s) => (
                    <TableRow key={`${s.college_id}:${s.id}`}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell className="font-mono text-xs">{s.college_id}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.is_active ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
