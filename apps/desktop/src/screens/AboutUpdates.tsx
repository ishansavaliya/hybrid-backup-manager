import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Download, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "@bakvion/shared-types";
import { GxDialog } from "@bakvion/ui/gx";
import { request } from "../api";
import { format, useI18n } from "../i18n";
import { Badge, Button, Card, CardHeader, Notice } from "../ui";

// Messages the service writes in English; shown in the chosen language.
const OFFLINE = "No internet connection.";
const BUSY = "A backup is running;";

/** Accepts only a well-formed status (an older service may answer differently). */
function asStatus(v: unknown): UpdateStatus | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  if (typeof o.current !== "string") return null;
  return {
    current: str("current"),
    latest: str("latest"),
    available: o.available === true,
    checkedAt: str("checkedAt"),
    installing: str("installing"),
    error: str("error"),
    automatic: o.automatic === true,
  };
}

/** Tauri's own version of the app window (from tauri.conf.json). */
async function windowVersion(): Promise<string> {
  if (!("__TAURI_INTERNALS__" in window)) return "";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}

export function AboutUpdates({
  serviceVersion,
  busy,
  act,
  notify,
}: {
  serviceVersion: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  notify: (m: string) => void;
}) {
  const { t, relative, dateTime } = useI18n();
  const s = t.settings;
  const [appVersion, setAppVersion] = useState("");
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [popup, setPopup] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [installErr, setInstallErr] = useState("");

  useEffect(() => {
    if (!installing || progress >= 92) return;
    const tmr = setInterval(() => {
      setProgress((p) => (p < 90 ? Math.min(90, p + 6) : p));
    }, 350);
    return () => clearInterval(tmr);
  }, [installing, progress]);

  async function startInstall() {
    setInstalling(true);
    setInstallErr("");
    setProgress(8);
    setStage("Downloading and verifying signed update…");
    try {
      const next = asStatus(await request<unknown>("installUpdate"));
      if (next) setStatus(next);
      if (next?.error) {
        setInstallErr(
          next.error.startsWith(OFFLINE)
            ? s.updOffline
            : next.error.startsWith(BUSY)
              ? s.updBusy
              : next.error,
        );
        setInstalling(false);
        setProgress(0);
        setStage("");
        return;
      }
      setProgress(100);
      setStage(
        "Update installer started. Bakvion will close while upgrading and restart BakvionService automatically.",
      );
      notify(
        format(s.installing, {
          v: next?.installing || status?.latest || "",
        }),
      );
    } catch (e) {
      setInstallErr(e instanceof Error ? e.message : String(e));
      setInstalling(false);
      setProgress(0);
      setStage("");
    }
  }

  const load = useCallback(async () => {
    try {
      setStatus(asStatus(await request<unknown>("updateStatus")));
    } catch {
      /* no service: versions below still show what is known */
    }
  }, []);
  useEffect(() => {
    void windowVersion().then(setAppVersion);
    void load();
  }, [load]);

  const service = status?.current || serviceVersion;
  const mismatch = !!appVersion && !!service && appVersion !== service;
  const message = !status
    ? ""
    : status.installing
      ? format(s.installing, { v: status.installing })
      : status.error.startsWith(OFFLINE)
        ? s.updOffline
        : status.error.startsWith(BUSY)
          ? s.updBusy
          : status.error
            ? status.error
            : !status.automatic
              ? s.devBuild
              : status.available
                ? format(s.updateAvailable, { v: status.latest })
                : status.checkedAt
                  ? s.upToDate
                  : "";

  const rows: [string, string][] = [
    [s.appVersionLabel, appVersion || "—"],
    [s.serviceVersion, service || "—"],
    [s.latestVersion, status?.latest || "—"],
  ];
  return (
    <Card>
      <CardHeader
        title={s.aboutTitle}
        description={s.aboutBody}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {status?.available && !status.installing ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setInstallErr("");
                  setProgress(0);
                  setStage("");
                  setInstalling(false);
                  setPopup(true);
                }}
              >
                <Download size={14} aria-hidden="true" />
                Update to {status.latest}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !status}
              onClick={() =>
                void act(async () => {
                  const next = asStatus(
                    await request<unknown>("checkForUpdates"),
                  );
                  setStatus(next);
                  if (!next) {
                    notify(s.upToDate);
                  } else if (next.installing) {
                    notify(format(s.installing, { v: next.installing }));
                  } else if (next.error.startsWith(OFFLINE)) {
                    notify(s.updOffline);
                  } else if (next.error.startsWith(BUSY)) {
                    notify(s.updBusy);
                  } else if (next.error) {
                    notify(next.error);
                  } else if (next.available) {
                    setInstallErr("");
                    setProgress(0);
                    setStage("");
                    setInstalling(false);
                    setPopup(true);
                    notify(format(s.updateAvailable, { v: next.latest }));
                  } else {
                    notify(s.upToDate);
                  }
                })
              }
            >
              <RefreshCw size={14} aria-hidden="true" />
              {s.checkUpdates}
            </Button>
          </div>
        }
      />
      <dl className="gx-kv-list">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="gx-tabular">{v}</dd>
          </div>
        ))}
        <div>
          <dt>{s.lastChecked}</dt>
          <dd
            title={status?.checkedAt ? dateTime(status.checkedAt) : undefined}
          >
            {status?.checkedAt ? relative(status.checkedAt) : s.notChecked}
          </dd>
        </div>
      </dl>
      {message ? (
        <p
          className="gx-hint"
          role="status"
          style={{ margin: "12px 0 0", display: "flex", gap: 8 }}
        >
          {status?.available || status?.installing ? (
            <Download size={14} aria-hidden="true" style={{ flex: "none" }} />
          ) : (
            <CircleCheck
              size={14}
              aria-hidden="true"
              style={{ flex: "none" }}
            />
          )}
          {message}
        </p>
      ) : null}
      {mismatch && !status?.installing ? (
        <p style={{ margin: "10px 0 0" }}>
          <Badge tone="warning" dot>
            {s.mismatch}
          </Badge>
        </p>
      ) : null}
      <GxDialog
        open={popup}
        onOpenChange={(o) => {
          if (!o && !installing) setPopup(false);
        }}
        title={`Update available: Bakvion ${status?.latest ?? ""}`}
        description="Bakvion will download, verify the signature, close this window, and upgrade the background service."
        closeLabel={t.common.close}
        width={500}
      >
        <div className="gx-dialog__body" style={{ display: "grid", gap: 14 }}>
          <dl className="gx-kv-list">
            <div>
              <dt>Installed version</dt>
              <dd className="gx-tabular">{service || appVersion || "—"}</dd>
            </div>
            <div>
              <dt>New version</dt>
              <dd className="gx-tabular">{status?.latest || "—"}</dd>
            </div>
          </dl>
          {installErr ? <Notice kind="error">{installErr}</Notice> : null}
          {installing || progress > 0 ? (
            <div className="gx-progress" role="status">
              <div className="gx-progress__head">
                <span>{stage || "Preparing update…"}</span>
                <span className="gx-tabular">{progress}%</span>
              </div>
              <div className="gx-progress__track">
                <div
                  className="gx-progress__fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="gx-muted" style={{ margin: 0 }}>
              Your backup plans, settings, and existing backups stay safe. After
              installation finishes (~10 seconds), reopen Bakvion from your
              Desktop or Start Menu.
            </p>
          )}
        </div>
        <footer className="gx-dialog__foot">
          {progress >= 100 ? (
            <Button onClick={() => window.close()}>Close app now</Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={installing}
                onClick={() => setPopup(false)}
              >
                Later
              </Button>
              <Button disabled={installing} onClick={() => void startInstall()}>
                <Download size={14} aria-hidden="true" />
                {installing ? `Installing (${progress}%)…` : "Close & install update"}
              </Button>
            </>
          )}
        </footer>
      </GxDialog>
    </Card>
  );
}
