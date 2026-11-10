import { useState } from "react";
import { Button, Card } from "@bakvion/ui";
import type { AccountStatus } from "@bakvion/shared-types";
import { pluralDays } from "./messages";

function lastSynced(s: AccountStatus): string {
  if (!s.lastSyncAt) return "never";
  if (s.daysSinceSync <= 0) return "today";
  return s.daysSinceSync === 1 ? "1 day ago" : `${s.daysSinceSync} days ago`;
}
const modeLabel = {
  full: "Active",
  restore_only: "Restore only",
  signed_out: "Signed out",
} as const;

export function AccountPanel({
  status,
  error,
  onSync,
  onSignOut,
}: {
  status: AccountStatus;
  error: string;
  onSync: () => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<boolean>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }
  return (
    <Card>
      <h2>Account</h2>
      <div className="stack">
        {status.clientName && <div>Client: {status.clientName}</div>}
        <div>Membership: {modeLabel[status.mode]}</div>
        {status.expiresAt && (
          <div>
            Expires: {new Date(status.expiresAt).toLocaleDateString()}
            {status.mode === "full" && ` (${pluralDays(status.daysLeft)} left)`}
          </div>
        )}
        <div>Last synced: {lastSynced(status)}</div>
        <div className="muted">Version {status.appVersion}</div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="row">
          <Button
            className="secondary"
            disabled={busy}
            onClick={() => void run(onSync)}
          >
            Sync now
          </Button>
          {status.signedIn &&
            (confirming ? (
              <>
                <span>Sign out of this PC? Existing backups stay on disk.</span>
                <Button disabled={busy} onClick={() => void run(onSignOut)}>
                  Confirm sign out
                </Button>
                <Button
                  className="secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button className="secondary" onClick={() => setConfirming(true)}>
                Sign out
              </Button>
            ))}
        </div>
      </div>
    </Card>
  );
}
