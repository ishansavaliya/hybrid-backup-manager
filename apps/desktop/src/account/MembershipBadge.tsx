import { useState } from "react";
import type { AccountStatus } from "@bakvion/shared-types";
import { format, useI18n } from "../i18n";
import { Badge } from "../ui";

export function MembershipBadge({ status }: { status: AccountStatus }) {
  const { t, days } = useI18n();
  const [open, setOpen] = useState(false);
  if (status.mode !== "full" || !status.showBadge) return null;
  return (
    <span className="gx-rel">
      <button
        type="button"
        className="gx-badge-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Badge tone="warning" dot>
          {format(t.membership.badge, { days: days(status.daysLeft) })}
        </Badge>
      </button>
      {open ? (
        <span className="gx-popover" role="status">
          {status.renewContact || t.membership.contact}
        </span>
      ) : null}
    </span>
  );
}
