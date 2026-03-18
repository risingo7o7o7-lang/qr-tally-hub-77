import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";

export default function HeadCoordinatorDashboard() {
  const { t } = useLanguage();
  return (
    <DashboardLayout title={t("nav.dashboard")}>
      <div className="text-muted-foreground">Head Coordinator Dashboard — coming soon.</div>
    </DashboardLayout>
  );
}
