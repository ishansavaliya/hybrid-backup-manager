import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Database,
  FolderOpen,
  Play,
} from "lucide-react";
import type { AgentOverview, Execution, Plan } from "@bakvion/shared-types";
import { format, useI18n } from "../i18n";
import { gigabytes } from "../notes";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Notice,
  stateTone,
} from "../ui";
import { HistoryTable } from "./History";
import { scheduleLabel } from "./ScheduleFields";

/** Latest run for every plan/destination pair. */
export function latestRuns(plans: Plan[], jobs: Execution[]) {
  const latest = new Map<string, Execution>();
  for (const j of jobs) {
    const key = `${j.planId}/${j.destinationId}`;
    const prev = latest.get(key);
    if (!prev || prev.startedAt < j.startedAt) latest.set(key, j);
  }
  const pairs = plans.flatMap((p) =>
    p.destinations.map((d) => latest.get(`${p.id}/${d.id}`)),
  );
  return pairs;
}

export function Overview({
  data,
  paused,
  busy,
  onBackupAll,
  onCreatePlan,
  onGo,
}: {
  data: AgentOverview;
  paused: boolean;
  busy: boolean;
  onBackupAll: () => void;
  onCreatePlan: () => void;
  onGo: (tab: "plans" | "history") => void;
}) {
  const { t, relative, dateTime, weekdays } = useI18n();
  const o = t.overview;
  // Backups opened from another PC are for restoring; they are not protection of this PC.
  const plans = data.plans.filter((p) => !p.restoreOnly);
  const jobs = data.executions;
  const pairs = latestRuns(plans, jobs);
  const done = pairs.filter((j) => j?.state === "succeeded").length;
  const bad = pairs.filter(
    (j) => j?.state === "failed" || j?.state === "interrupted",
  ).length;
  const pct = pairs.length ? Math.round((done / pairs.length) * 100) : 0;
  const active = jobs.filter(
    (j) => j.state === "running" || j.state === "queued",
  ).length;
  const lastOk = jobs
    .filter((j) => j.state === "succeeded")
    .sort((a, b) =>
      (b.finishedAt ?? b.startedAt).localeCompare(a.finishedAt ?? a.startedAt),
    )[0];
  const state = !plans.length || !done ? "none" : bad ? "attention" : "ok";
  const nextRun = Object.values(data.nextRuns ?? {}).sort()[0];
  const full = (data.disks ?? [])
    .filter((d) => d.usedPercent >= 90)
    .sort((a, b) => b.usedPercent - a.usedPercent)[0];
  const fullName = full
    ? plans
        .find((p) => p.id === full.planId)
        ?.destinations.find((d) => d.id === full.destinationId)?.name
    : undefined;

  return (
    <div className="gx-stack">
      {full && fullName ? (
        <Notice kind="error">
          <strong>{o.diskFullTitle}.</strong>{" "}
          {format(o.diskFullBody, {
            name: fullName,
            n: full.usedPercent,
            free: gigabytes(full.freeBytes),
          })}
        </Notice>
      ) : null}
      <Card className="gx-hero">
        <div className="gx-ring" style={{ ["--p" as string]: pct }}>
          <div className="gx-ring__inner">{pct}%</div>
        </div>
        <div className="gx-hero__status">
          <span className="gx-hero__label" data-state={state}>
            {state === "ok" ? (
              <CheckCircle2 size={15} aria-hidden="true" />
            ) : (
              <CircleAlert size={15} aria-hidden="true" />
            )}
            {state === "ok"
              ? o.protected
              : state === "attention"
                ? o.attention
                : o.notYet}
          </span>
          <span className="gx-hero__title">
            {lastOk
              ? format(o.lastBackup, {
                  when: relative(lastOk.finishedAt ?? lastOk.startedAt),
                })
              : o.noBackup}
          </span>
          <span className="gx-muted gx-small">
            {lastOk
              ? `${dateTime(lastOk.finishedAt ?? lastOk.startedAt)} · `
              : ""}
            {nextRun
              ? format(o.nextBackup, { when: relative(nextRun) })
              : o.manualNext}
          </span>
        </div>
        <Button
          onClick={onBackupAll}
          disabled={busy || paused || !plans.length}
        >
          <Play size={16} aria-hidden="true" />
          {o.backupNow}
        </Button>
      </Card>

      <div className="gx-tiles">
        {(
          [
            [o.tilePlans, plans.length, Database],
            [
              o.tileDone,
              jobs.filter((j) => j.state === "succeeded").length,
              CheckCircle2,
            ],
            [o.tileAttention, bad, CircleAlert],
            [o.tileActive, active, Activity],
          ] as const
        ).map(([label, value, Icon]) => (
          <Card key={label} className="gx-tile">
            <span className="gx-tile__label">
              {label}
              <Icon size={16} aria-hidden="true" />
            </span>
            <span className="gx-tile__value">{value}</span>
          </Card>
        ))}
      </div>

      <div className="gx-two">
        <Card>
          <CardHeader
            title={o.plansTitle}
            actions={
              plans.length ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onGo("plans")}
                >
                  {o.viewAll}
                  <ArrowRight size={14} aria-hidden="true" />
                </Button>
              ) : null
            }
          />
          {plans.length ? (
            <div className="gx-list">
              {plans.map((p) => {
                const runs = p.destinations.map((d) =>
                  jobs.find(
                    (j) => j.planId === p.id && j.destinationId === d.id,
                  ),
                );
                const worst =
                  runs.find(
                    (r) =>
                      r && (r.state === "failed" || r.state === "interrupted"),
                  ) ??
                  runs.find(
                    (r) => r && (r.state === "running" || r.state === "queued"),
                  ) ??
                  runs.find(Boolean);
                return (
                  <div className="gx-row" key={p.id}>
                    <div className="gx-row__main">
                      <span className="gx-row__title">{p.name}</span>
                      <span className="gx-row__sub">
                        {format(o.foldersCount, { n: p.sources.length })} ·{" "}
                        {format(o.destinationsCount, {
                          n: p.destinations.length,
                        })}
                      </span>
                    </div>
                    {worst ? (
                      <Badge tone={stateTone(worst.state)} dot>
                        {t.states[worst.state as keyof typeof t.states] ??
                          worst.state}
                      </Badge>
                    ) : (
                      <Badge>{scheduleLabel(t, weekdays, p.schedule)}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<FolderOpen size={20} />}
              title={o.emptyPlansTitle}
              action={
                <Button onClick={onCreatePlan} disabled={paused}>
                  {o.createPlan}
                </Button>
              }
            >
              {o.emptyPlansBody}
            </EmptyState>
          )}
        </Card>
        <Card flush>
          <div
            className="gx-card-header"
            style={{ padding: "18px 20px", margin: 0 }}
          >
            <div className="gx-card-header__text">
              <h2 className="gx-card-header__title">{o.recentTitle}</h2>
            </div>
            <div className="gx-card-header__actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onGo("history")}
              >
                {o.viewHistory}
              </Button>
            </div>
          </div>
          <HistoryTable plans={plans} jobs={jobs.slice(0, 5)} compact />
        </Card>
      </div>
    </div>
  );
}
