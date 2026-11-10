import { useState } from "react";
import { CalendarClock, Database, HardDrive, Play } from "lucide-react";
import type {
  AgentOverview,
  Plan,
  Retention,
  Schedule,
} from "@bakvion/shared-types";
import { defaultRetention } from "@bakvion/validation";
import { GxDialog } from "@bakvion/ui/gx";
import { request } from "../api";
import { format, useI18n } from "../i18n";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PasswordInput,
  stateTone,
} from "../ui";
import {
  cleanSchedule,
  cleanupLabel,
  scheduleLabel,
  ScheduleFields,
} from "./ScheduleFields";

export function Plans({
  data,
  paused,
  busy,
  act,
  notify,
  onCreatePlan,
}: {
  data: AgentOverview;
  paused: boolean;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  notify: (m: string) => void;
  onCreatePlan: () => void;
}) {
  const { t, weekdays, relative, dateTime } = useI18n();
  const p = t.plans;
  type Target = { planId: string; destinationId: string };
  const [initFor, setInitFor] = useState<Target | null>(null);
  const [connectFor, setConnectFor] = useState<Target | null>(null);
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState<{
    plan: Plan;
    schedule: Schedule;
    retention: Retention;
  } | null>(null);
  const editValid =
    !!editing &&
    (!["daily", "weekly"].includes(editing.schedule.kind) ||
      !!editing.schedule.time) &&
    (editing.schedule.kind !== "weekly" || !!editing.schedule.days?.length) &&
    (!editing.retention.enabled ||
      editing.retention.daily +
        editing.retention.weekly +
        editing.retention.monthly >
        0);
  const jobs = data.executions;
  if (!data.plans.length)
    return (
      <Card>
        <EmptyState
          icon={<Database size={20} />}
          title={p.emptyTitle}
          action={
            <Button onClick={onCreatePlan} disabled={paused}>
              {t.overview.createPlan}
            </Button>
          }
        >
          {p.emptyBody}
        </EmptyState>
      </Card>
    );
  return (
    <div className="gx-stack">
      {data.plans.map((plan) => {
        const running = jobs.some(
          (j) =>
            j.planId === plan.id &&
            (j.state === "running" || j.state === "queued"),
        );
        const next = data.nextRuns?.[plan.id];
        const ro = !!plan.restoreOnly;
        return (
          <Card key={plan.id} className="gx-plan">
            <CardHeader
              title={plan.name}
              description={
                ro ? (
                  p.restoreOnlyHint
                ) : (
                  <>
                    {scheduleLabel(t, weekdays, plan.schedule)}
                    {next ? (
                      <span title={dateTime(next)}>
                        {" · "}
                        {format(p.next, { when: relative(next) })}
                      </span>
                    ) : null}
                    <br />
                    {cleanupLabel(t, plan.retention)}
                  </>
                )
              }
              actions={
                ro ? (
                  <Badge tone="warning">{p.restoreOnly}</Badge>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy || paused}
                      onClick={() =>
                        setEditing({
                          plan,
                          schedule: plan.schedule ?? { kind: "manual" },
                          retention: plan.retention ?? defaultRetention,
                        })
                      }
                    >
                      <CalendarClock size={15} aria-hidden="true" />
                      {p.edit}
                    </Button>
                    <Button
                      disabled={busy || paused || running}
                      onClick={() =>
                        void act(async () => {
                          await request("startBackup", { planId: plan.id });
                          notify(p.queued);
                        })
                      }
                    >
                      <Play size={15} aria-hidden="true" />
                      {p.run}
                    </Button>
                  </>
                )
              }
            />
            <p className="gx-section-label">{p.folders}</p>
            <div className="gx-chips-list">
              {plan.sources.map((s) => (
                <span className="gx-chip-static" key={s} title={s}>
                  {s}
                </span>
              ))}
            </div>
            <p className="gx-section-label" style={{ marginTop: 16 }}>
              {p.destinations}
            </p>
            <div className="gx-list">
              {plan.destinations.map((d) => {
                const last = jobs.find(
                  (j) => j.planId === plan.id && j.destinationId === d.id,
                );
                const params = { planId: plan.id, destinationId: d.id };
                const disk = data.disks?.find(
                  (x) => x.planId === plan.id && x.destinationId === d.id,
                );
                return (
                  <div className="gx-row" key={d.id}>
                    <div className="gx-row__main">
                      <span className="gx-row__title">
                        <HardDrive
                          size={14}
                          aria-hidden="true"
                          style={{ marginRight: 6, verticalAlign: -2 }}
                        />
                        {d.name}
                        {last ? (
                          <span style={{ marginLeft: 8 }}>
                            <Badge tone={stateTone(last.state)} dot>
                              {t.states[last.state as keyof typeof t.states] ??
                                last.state}
                            </Badge>
                          </span>
                        ) : null}
                        {disk && disk.usedPercent >= 90 ? (
                          <span style={{ marginLeft: 8 }}>
                            <Badge tone="warning" dot>
                              {format(p.diskFull, { n: disk.usedPercent })}
                            </Badge>
                          </span>
                        ) : null}
                      </span>
                      <span className="gx-path" title={d.repository}>
                        {d.repository}
                      </span>
                    </div>
                    <div className="gx-row__actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request("testDestination", params);
                            notify(p.testOk);
                          })
                        }
                      >
                        {p.test}
                      </Button>
                      {ro ? null : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy || paused}
                          onClick={() => setInitFor(params)}
                        >
                          {p.init}
                        </Button>
                      )}
                      {d.passwordFile || ro ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setKey("");
                            setConnectFor(params);
                          }}
                        >
                          {p.connect}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request("check", params);
                            notify(p.verifyOk);
                          })
                        }
                      >
                        {p.verify}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
      <GxDialog
        open={!!initFor}
        onOpenChange={(o) => !o && setInitFor(null)}
        title={p.initTitle}
        closeLabel={t.common.close}
        width={460}
      >
        <div className="gx-dialog__body">
          <p className="gx-muted">{p.initBody}</p>
        </div>
        <footer className="gx-dialog__foot">
          <Button variant="secondary" onClick={() => setInitFor(null)}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={() => {
              const target = initFor;
              setInitFor(null);
              if (target)
                void act(async () => {
                  await request("initRepository", target);
                  notify(p.initOk);
                });
            }}
          >
            {p.init}
          </Button>
        </footer>
      </GxDialog>
      <GxDialog
        open={!!connectFor}
        onOpenChange={(o) => !o && setConnectFor(null)}
        title={p.connectTitle}
        description={p.connectBody}
        closeLabel={t.common.close}
        width={500}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const target = connectFor;
            const value = key;
            setConnectFor(null);
            setKey("");
            if (target)
              void act(async () => {
                await request("connectDestination", { ...target, key: value });
                notify(p.connectOk);
              });
          }}
        >
          <div className="gx-dialog__body">
            <Field label={p.connectKey} htmlFor="pl-connect-key">
              <PasswordInput
                id="pl-connect-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                showLabel={t.signin.showPassword}
                hideLabel={t.signin.hidePassword}
                autoComplete="off"
                autoFocus
              />
            </Field>
          </div>
          <footer className="gx-dialog__foot">
            <Button variant="secondary" onClick={() => setConnectFor(null)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={key.trim().length < 8}>
              {p.connect}
            </Button>
          </footer>
        </form>
      </GxDialog>
      <GxDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={p.edit}
        description={editing?.plan.name}
        closeLabel={t.common.close}
        width={620}
      >
        <div className="gx-dialog__body">
          {editing ? (
            <ScheduleFields
              idPrefix="pl"
              schedule={editing.schedule}
              retention={editing.retention}
              onSchedule={(schedule) => setEditing({ ...editing, schedule })}
              onRetention={(retention) => setEditing({ ...editing, retention })}
            />
          ) : null}
        </div>
        <footer className="gx-dialog__foot">
          <Button variant="secondary" onClick={() => setEditing(null)}>
            {t.common.cancel}
          </Button>
          <Button
            disabled={!editValid}
            onClick={() => {
              const e = editing;
              setEditing(null);
              if (e)
                void act(async () => {
                  await request("savePlan", {
                    ...e.plan,
                    schedule: cleanSchedule(e.schedule),
                    retention: e.retention,
                  });
                  notify(p.saved);
                });
            }}
          >
            {t.wizard.save}
          </Button>
        </footer>
      </GxDialog>
    </div>
  );
}
