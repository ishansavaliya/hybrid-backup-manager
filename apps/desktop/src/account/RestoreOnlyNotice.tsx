import { useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import type { AccountStatus } from "@bakvion/shared-types";
import { useI18n } from "../i18n";
import { Button } from "../ui";

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
  const { t } = useI18n();
  const n = t.notice;
  const reasons: Record<string, string> = {
    expired: n.expired,
    blocked: n.blocked,
    clock: n.clock,
    pc_limit: n.pcLimit,
    signed_out: n.signedOut,
  };
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
    <div className="gx-restore-notice" role="status">
      <CircleAlert size={20} aria-hidden="true" />
      <div className="gx-restore-notice__text">
        <strong>{reasons[status.reason] ?? n.restoreOk}</strong>
        <p>
          {n.restoreOk}
          {status.renewContact ? ` ${status.renewContact}` : ""}
        </p>
        {error ? <p role="alert">{error}</p> : null}
      </div>
      <div className="gx-restore-notice__actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={syncing}
          onClick={() => void sync()}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {syncing ? t.common.syncing : t.common.syncNow}
        </Button>
        {status.mode === "signed_out" ? (
          <Button size="sm" onClick={onSignIn}>
            {t.common.signIn}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
