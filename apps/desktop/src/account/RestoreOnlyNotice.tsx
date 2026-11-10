import { useState } from "react";
import { Button } from "@bakvion/ui";
import type { AccountStatus } from "@bakvion/shared-types";

const reasons: Record<string, string> = {
  expired: "Your membership has expired.",
  blocked: "Your account is paused.",
  clock:
    "Your PC's date and time look wrong. Correct them in Windows Settings, then click Sync now.",
  pc_limit:
    "This PC is not active because your plan's PC limit is reached. Remove another PC or contact your Bakvion provider.",
  signed_out: "You are signed out.",
};

export function RestoreOnlyNotice({
  status,
  error,
  onSync,
  onSignIn,
}: {
  status: AccountStatus;
  error: string;
  onSync: () => Promise<boolean>;
  onSignIn: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  async function sync() {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  }
  return (
    <div className="notice" role="status">
      <strong>{reasons[status.reason] ?? "Backups are paused."}</strong>
      <p>
        New backups are paused. You can still restore your existing backups.
        {status.renewContact && ` Contact ${status.renewContact} to renew.`}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <Button
          className="secondary"
          disabled={syncing}
          onClick={() => void sync()}
        >
          Sync now
        </Button>
        {status.mode === "signed_out" && (
          <Button onClick={onSignIn}>Sign in</Button>
        )}
      </div>
    </div>
  );
}
