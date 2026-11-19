import { Activity } from "lucide-react";
import type { Execution, Plan } from "@bakvion/shared-types";
import { useI18n } from "../i18n";
import { Badge, EmptyState, stateTone } from "../ui";
import { runNotes } from "../notes";

function friendlyRunError(raw: string): string {
  const e = raw.toLowerCase();
  if (
    e.includes("exit status 10") ||
    e.includes("does not exist") ||
    e.includes("cannot find the path")
  )
    return "External backup disk or folder was not connected. Plug in your drive and try again.";
  if (e.includes("exit status 11") || e.includes("lock"))
    return "Another backup or verification was already using this disk. Try again in a moment.";
  if (e.includes("exit status 12") || e.includes("wrong password"))
    return "Backup key did not match this destination folder.";
  if (e.includes("write probe failed"))
    return "Cannot write to the backup disk. Check that the drive is plugged in and unlocked.";
  return raw;
}

export function HistoryTable({
  plans,
  jobs,
  compact,
}: {
  plans: Plan[];
  jobs: Execution[];
  compact?: boolean;
}) {
  const { t, dateTime } = useI18n();
  const h = t.history;
  if (!jobs.length)
    return (
      <EmptyState icon={<Activity size={20} />} title={h.emptyTitle}>
        {h.emptyBody}
      </EmptyState>
    );
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const destName = (pid: string, did: string) =>
    plans.find((p) => p.id === pid)?.destinations.find((d) => d.id === did)
      ?.name ?? did;
  return (
    <div className="gx-table-scroll">
      <table className="gx-table">
        <thead>
          <tr>
            <th scope="col">{h.plan}</th>
            <th scope="col">{h.started}</th>
            <th scope="col">{h.status}</th>
            {compact ? null : <th scope="col">{h.details}</th>}
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>
                <div className="gx-cell-main">
                  <span className="gx-strong">{planName(j.planId)}</span>
                  <span className="gx-cell-sub">
                    {destName(j.planId, j.destinationId)}
                  </span>
                </div>
              </td>
              <td className="gx-nowrap">{dateTime(j.startedAt)}</td>
              <td>
                <Badge tone={stateTone(j.state)} dot>
                  {t.states[j.state as keyof typeof t.states] ?? j.state}
                </Badge>
              </td>
              {compact ? null : (
                <td className="gx-muted">
                  {(j.error ? friendlyRunError(j.error) : "") ||
                    (j.snapshotId ? j.snapshotId.slice(0, 12) : h.waiting)}
                  {runNotes(t, j.notes).map((n) => (
                    <span
                      key={n.raw}
                      title={n.raw}
                      style={
                        n.tone === "warning"
                          ? { color: "var(--gx-warn)" }
                          : undefined
                      }
                    >
                      {" · "}
                      {n.text}
                    </span>
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
