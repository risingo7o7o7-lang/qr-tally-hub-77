import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ModuleCoordinatorDashboard() {
  const { t } = useLanguage();
  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <div className="text-muted-foreground">Module Coordinator Dashboard — coming soon.</div>
    </DashboardLayout>
  );
}
