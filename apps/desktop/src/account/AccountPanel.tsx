import { useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import type { AccountStatus } from "@bakvion/shared-types";
import { GxDialog } from "@bakvion/ui/gx";
import { useI18n } from "../i18n";
import { Badge, Button, Card, CardHeader, Notice } from "../ui";

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
  const { t, daysAgo, days, date } = useI18n();
  const s = t.settings;
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
  const lastSynced = !status.lastSyncAt
    ? t.common.never
    : daysAgo(status.daysSinceSync);
  const mode =
    status.mode === "full"
      ? { tone: "success" as const, label: s.modeFull }
      : status.mode === "restore_only"
        ? { tone: "warning" as const, label: s.modeRestore }
        : { tone: "neutral" as const, label: s.modeSignedOut };
  return (
    <Card>
      <CardHeader
        title={s.account}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void run(onSync)}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t.common.syncNow}
          </Button>
        }
      />
      <dl className="gx-kv-list">
        {status.clientName ? (
          <div>
            <dt>{s.client}</dt>
            <dd>{status.clientName}</dd>
          </div>
        ) : null}
        <div>
          <dt>{s.mode}</dt>
          <dd>
            <Badge tone={mode.tone} dot>
              {mode.label}
            </Badge>
          </dd>
        </div>
        {status.expiresAt ? (
          <div>
            <dt>{s.expires}</dt>
            <dd>
              {date(status.expiresAt)}
              {status.mode === "full" ? ` · ${days(status.daysLeft)}` : ""}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{s.lastSync}</dt>
          <dd>{lastSynced}</dd>
        </div>
        <div>
          <dt>{s.version}</dt>
          <dd>{status.appVersion}</dd>
        </div>
      </dl>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {status.signedIn ? (
        <div className="gx-form__actions" style={{ marginTop: 14 }}>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            <LogOut size={15} aria-hidden="true" />
            {t.common.signOut}
          </Button>
        </div>
      ) : null}
      <GxDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={s.signOutTitle}
        closeLabel={t.common.close}
        width={440}
      >
        <div className="gx-dialog__body">
          <p className="gx-muted">{s.signOutBody}</p>
        </div>
        <footer className="gx-dialog__foot">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void run(onSignOut)}
          >
            {t.common.signOut}
          </Button>
        </footer>
      </GxDialog>
    </Card>
  );
}
