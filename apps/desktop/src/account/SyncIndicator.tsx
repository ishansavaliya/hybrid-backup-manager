import type { AccountStatus } from "@bakvion/shared-types";
import { format, useI18n } from "../i18n";
import { Badge } from "../ui";

export function SyncIndicator({ status }: { status: AccountStatus }) {
  const { t, days } = useI18n();
  if (!status.syncWarning) return null;
  return (
    <Badge tone="warning">
      {format(t.membership.syncWarning, { days: days(status.daysSinceSync) })}
    </Badge>
  );
}
