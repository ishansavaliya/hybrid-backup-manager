import { useState } from "react";
import { Database, HardDrive, Play } from "lucide-react";
import type { AgentOverview } from "@bakvion/shared-types";
import { GxDialog } from "@bakvion/ui/gx";
import { request } from "../api";
import { useI18n } from "../i18n";
import { Badge, Button, Card, CardHeader, EmptyState, stateTone } from "../ui";

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
  const { t } = useI18n();
  const p = t.plans;
  const [initFor, setInitFor] = useState<{
    planId: string;
    destinationId: string;
  } | null>(null);
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
        return (
          <Card key={plan.id} className="gx-plan">
            <CardHeader
              title={plan.name}
              description={p.manual}
              actions={
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
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || paused}
                        onClick={() => setInitFor(params)}
                      >
                        {p.init}
                      </Button>
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
    </div>
  );
}
