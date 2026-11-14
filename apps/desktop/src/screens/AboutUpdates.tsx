import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Download, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "@bakvion/shared-types";
import { request } from "../api";
import { format, useI18n } from "../i18n";
import { Badge, Button, Card, CardHeader } from "../ui";

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
}: {
  serviceVersion: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const { t, relative, dateTime } = useI18n();
  const s = t.settings;
  const [appVersion, setAppVersion] = useState("");
  const [status, setStatus] = useState<UpdateStatus | null>(null);

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
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !status}
            onClick={() =>
              void act(async () => {
                setStatus(asStatus(await request<unknown>("checkForUpdates")));
              })
            }
          >
            <RefreshCw size={14} aria-hidden="true" />
            {s.checkUpdates}
          </Button>
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
    </Card>
  );
}
