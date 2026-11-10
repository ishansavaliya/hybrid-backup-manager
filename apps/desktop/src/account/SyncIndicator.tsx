import { Badge } from "@bakvion/ui";
import type { AccountStatus } from "@bakvion/shared-types";
import { pluralDays } from "./messages";

export function SyncIndicator({ status }: { status: AccountStatus }) {
  if (!status.syncWarning) return null;
  return (
    <Badge tone="warning">
      {`Not synced for ${pluralDays(status.daysSinceSync)} — connect to the internet`}
    </Badge>
  );
}
