import { useState } from "react";
import { Badge } from "@bakvion/ui";
import type { AccountStatus } from "@bakvion/shared-types";
import { pluralDays } from "./messages";

export function MembershipBadge({ status }: { status: AccountStatus }) {
  const [open, setOpen] = useState(false);
  if (status.mode !== "full" || !status.showBadge) return null;
  return (
    <>
      <button
        type="button"
        className="badge-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Badge tone="warning">
          {`Membership expires in ${pluralDays(status.daysLeft)} — please renew`}
        </Badge>
      </button>
      {open && (
        <span className="muted" role="status">
          {status.renewContact
            ? `To renew, contact ${status.renewContact}`
            : "Contact your Bakvion provider to renew."}
        </span>
      )}
    </>
  );
}
