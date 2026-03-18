import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { AtRiskStudents } from "@/components/dashboard/AtRiskStudents";
import { AttendanceDrilldown } from "@/components/dashboard/AttendanceDrilldown";
import type { Session } from "@/lib/dashboardTypes";

export default function CoordinatorDashboard() {
  const { t } = useLanguage();
  const [drilldown, setDrilldown] = useState<Session | null>(null);

  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">All Sessions</TabsTrigger>
          <TabsTrigger value="at-risk">At-Risk Students</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-4">
          <SessionsTable onSessionClick={setDrilldown} />
          <AttendanceDrilldown session={drilldown} open={!!drilldown} onClose={() => setDrilldown(null)} />
        </TabsContent>

        <TabsContent value="at-risk" className="mt-4">
          <AtRiskStudents />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
