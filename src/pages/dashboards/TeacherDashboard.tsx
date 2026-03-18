import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";

export default function TeacherDashboard() {
  const { t } = useLanguage();
  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <div className="text-muted-foreground">Teacher Dashboard — coming soon.</div>
    </DashboardLayout>
  );
}
