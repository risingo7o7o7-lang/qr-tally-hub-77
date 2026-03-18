import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CollegeAdminDashboard() {
  const { t } = useLanguage();
  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <div className="text-muted-foreground">College Admin Dashboard — coming soon.</div>
    </DashboardLayout>
  );
}
