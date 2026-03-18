import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";

export default function StudentDashboard() {
  const { t } = useLanguage();
  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <div className="text-muted-foreground">Student Dashboard — coming soon.</div>
    </DashboardLayout>
  );
}
