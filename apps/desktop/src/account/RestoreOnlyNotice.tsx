import { Button } from "@bakvion/ui";
import type { AccountStatus } from "@bakvion/shared-types";

const reasons: Record<string, string> = {
  expired: "Your membership has expired.",
  blocked: "Your account is paused.",
  clock: "Your PC clock looks wrong. Connect to the internet to verify.",
  pc_limit:
    "This PC is not active because your plan's PC limit is reached. Remove another PC or contact your Bakvion provider.",
  signed_out: "You are signed out.",
};

export function RestoreOnlyNotice({
  status,
  busy,
  onSync,
  onSignIn,
}: {
  status: AccountStatus;
  busy: boolean;
  onSync: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="notice" role="status">
      <strong>{reasons[status.reason] ?? "Backups are paused."}</strong>
      <p>
        New backups are paused. You can still restore your existing backups.
        {status.renewContact && ` Contact ${status.renewContact} to renew.`}
      </p>
      <div className="row">
        <Button className="secondary" disabled={busy} onClick={onSync}>
          Sync now
        </Button>
        {status.mode === "signed_out" && (
          <Button onClick={onSignIn}>Sign in</Button>
        )}
      </div>
    </div>
  );
}
