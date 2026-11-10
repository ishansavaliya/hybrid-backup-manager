import { useState } from "react";
import { ArrowRight, FolderPlus, HardDrive, KeyRound, X } from "lucide-react";
import type { Plan, Retention, Schedule } from "@bakvion/shared-types";
import { defaultRetention, planSchema } from "@bakvion/validation";
import { GxDialog } from "@bakvion/ui/gx";
import { choose } from "../api";
import { format, useI18n } from "../i18n";
import { Button, Field, Input, Notice } from "../ui";
import {
  cleanSchedule,
  cleanupLabel,
  DEFAULT_DAYS,
  DEFAULT_TIME,
  scheduleLabel,
  ScheduleFields,
} from "./ScheduleFields";

const NEW_SCHEDULE: Schedule = {
  kind: "daily",
  time: DEFAULT_TIME,
  days: DEFAULT_DAYS,
};

export function PlanWizard({
  open,
  close,
  save,
}: {
  open: boolean;
  close: () => void;
  save: (p: Plan) => Promise<void>;
}) {
  const { t, weekdays } = useI18n();
  const w = t.wizard;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState("");
  const [destinations, setDestinations] = useState<Plan["destinations"]>([]);
  const [schedule, setSchedule] = useState<Schedule>(NEW_SCHEDULE);
  const [retention, setRetention] = useState<Retention>(defaultRetention);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = () => crypto.randomUUID().replaceAll("-", "");
  const titles = [w.s1, w.s2, w.s3, w.s4];

  async function native(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function reset() {
    setStep(0);
    setName("");
    setSources([]);
    setExclusions("");
    setDestinations([]);
    setSchedule(NEW_SCHEDULE);
    setRetention(defaultRetention);
    setError("");
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      const parsed = planSchema.parse({
        id: id(),
        name,
        sources,
        exclusions: exclusions.split("\n").filter(Boolean),
        destinations,
        schedule: cleanSchedule(schedule),
        retention,
      });
      await save(parsed);
      close();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const canNext =
    (step === 0 && !!name.trim() && sources.length > 0) ||
    (step === 1 && destinations.length > 0) ||
    (step === 2 &&
      (!["daily", "weekly"].includes(schedule.kind) || !!schedule.time) &&
      (schedule.kind !== "weekly" || !!schedule.days?.length) &&
      (!retention.enabled ||
        retention.daily + retention.weekly + retention.monthly > 0));

  return (
    <GxDialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      title={w.title}
      description={`${format(w.step, { n: step + 1 })} · ${titles[step]}`}
      closeLabel={t.common.close}
      width={680}
    >
      <div className="gx-dialog__body">
        <div className="gx-steps" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i <= step ? "is-done" : ""} />
          ))}
        </div>
        {error ? <Notice kind="error">{error}</Notice> : null}

        {step === 0 && (
          <>
            <Field label={w.name} htmlFor="wz-name">
              <Input
                id="wz-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder={w.namePlaceholder}
                autoFocus
              />
            </Field>
            <div>
              <Button
                variant="secondary"
                onClick={() =>
                  void native(async () => {
                    const p = await choose(true);
                    if (p && !sources.includes(p)) setSources([...sources, p]);
                  })
                }
              >
                <FolderPlus size={16} aria-hidden="true" />
                {w.addFolder}
              </Button>
            </div>
            {sources.length ? (
              <div className="gx-list">
                {sources.map((s) => (
                  <div className="gx-row" key={s}>
                    <span className="gx-path" title={s}>
                      {s}
                    </span>
                    <button
                      type="button"
                      className="gx-btn gx-btn--ghost gx-btn--sm gx-btn--icon"
                      aria-label={`${t.common.remove} ${s}`}
                      onClick={() => setSources(sources.filter((x) => x !== s))}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <Field label={w.exclusions} htmlFor="wz-ex" hint={w.exclusionsHint}>
              <textarea
                id="wz-ex"
                className="gx-textarea"
                rows={3}
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
                placeholder="*.tmp"
              />
            </Field>
            <p className="gx-hint">{w.fileLevel}</p>
          </>
        )}

        {step === 1 && (
          <>
            <p className="gx-muted">{w.destHint}</p>
            <div>
              <Button
                variant="secondary"
                onClick={() =>
                  void native(async () => {
                    const parent = await choose(true);
                    if (parent)
                      setDestinations([
                        ...destinations,
                        {
                          id: id(),
                          name: format(w.destDefault, {
                            n: destinations.length + 1,
                          }),
                          repository:
                            parent.replace(/[\\/]$/, "") +
                            (parent.includes("\\") ? "\\" : "/") +
                            "BakvionRepository",
                          passwordFile: "",
                        },
                      ]);
                  })
                }
              >
                <HardDrive size={16} aria-hidden="true" />
                {w.addDestination}
              </Button>
            </div>
            {destinations.map((d) => (
              <div
                className="gx-card"
                key={d.id}
                style={{ display: "grid", gap: 10 }}
              >
                <Field label={w.destName} htmlFor={`wz-d-${d.id}`}>
                  <Input
                    id={`wz-d-${d.id}`}
                    value={d.name}
                    onChange={(e) =>
                      setDestinations(
                        destinations.map((x) =>
                          x.id === d.id ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <span className="gx-path" title={d.repository}>
                  {d.repository}
                </span>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDestinations(destinations.filter((x) => x.id !== d.id))
                    }
                  >
                    {w.removeDestination}
                  </Button>
                </div>
              </div>
            ))}
            <p className="gx-hint">{w.storeHint}</p>
          </>
        )}

        {step === 2 && (
          <>
            <ScheduleFields
              idPrefix="wz"
              schedule={schedule}
              retention={retention}
              onSchedule={setSchedule}
              onRetention={setRetention}
            />
            <p className="gx-hint" style={{ display: "flex", gap: 8 }}>
              <KeyRound size={15} aria-hidden="true" style={{ flex: "none" }} />
              {w.keyNote}
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <p>
              <strong>{name}</strong>{" "}
              <span className="gx-muted">
                ·{" "}
                {format(w.summary, {
                  folders: sources.length,
                  destinations: destinations.length,
                })}
              </span>
            </p>
            <div className="gx-chips-list">
              {sources.map((s) => (
                <span className="gx-chip-static" key={s}>
                  {s}
                </span>
              ))}
            </div>
            <div className="gx-list">
              {destinations.map((d) => (
                <div className="gx-row" key={d.id}>
                  <div className="gx-row__main">
                    <span className="gx-row__title">{d.name}</span>
                    <span className="gx-path">{d.repository}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="gx-list">
              <div className="gx-row">
                <span className="gx-row__title">
                  {scheduleLabel(t, weekdays, cleanSchedule(schedule))}
                </span>
              </div>
              <div className="gx-row">
                <span className="gx-muted">{cleanupLabel(t, retention)}</span>
              </div>
            </div>
            <p className="gx-hint">{w.reviewNote}</p>
          </>
        )}
      </div>
      <footer className="gx-dialog__foot">
        <Button
          variant="secondary"
          disabled={step === 0 || busy}
          onClick={() => setStep(step - 1)}
        >
          {t.common.back}
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
            {t.common.continue}
            <ArrowRight size={15} aria-hidden="true" />
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void finish()}>
            {busy ? w.saving : w.save}
          </Button>
        )}
      </footer>
    </GxDialog>
  );
}
