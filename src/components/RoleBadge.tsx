import { Badge } from "@/components/ui/badge";
import type { AppRole } from "@/lib/appRoles";
import { ROLE_LABELS } from "@/lib/appRoles";

export function RoleBadge({ role }: { role: AppRole }) {
  return <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>;
}

