import type { Retention, Schedule, ScheduleKind } from "@bakvion/shared-types";
import { format, useI18n, type AppText } from "../i18n";
import { cx, Field, Input, Segmented } from "../ui";

export const DEFAULT_TIME = "13:00";
/** Monday to Saturday: the usual working week. */
export const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

/** Drops fields the chosen kind does not use, so saved plans stay clean. */
export function cleanSchedule(s: Schedule): Schedule {
  if (s.kind === "daily") return { kind: "daily", time: s.time };
  if (s.kind === "weekly")
    return {
      kind: "weekly",
      time: s.time,
      days: [...(s.days ?? [])].sort((a, b) => a - b),
    };
  return { kind: s.kind };
}

export function scheduleLabel(
  t: AppText,
  weekdays: string[],
  s: Schedule | undefined,
): string {
  const p = t.plans;
  if (!s || s.kind === "manual") return p.manual;
  if (s.kind === "hourly") return p.hourly;
  if (s.kind === "daily") return format(p.dailyAt, { time: s.time ?? "" });
  const days = (s.days ?? []).map((d) => weekdays[d]).join(", ");
  return format(p.weeklyAt, { days, time: s.time ?? "" });
}

export function cleanupLabel(t: AppText, r: Retention | undefined): string {
  if (!r?.enabled) return t.plans.cleanupOff;
  return format(t.plans.cleanupOn, {
    daily: r.daily,
    weekly: r.weekly,
    monthly: r.monthly,
  });
}

export function ScheduleFields({
  idPrefix,
  schedule,
  retention,
  onSchedule,
  onRetention,
}: {
  idPrefix: string;
  schedule: Schedule;
  retention: Retention;
  onSchedule: (s: Schedule) => void;
  onRetention: (r: Retention) => void;
}) {
  const { t, weekdays } = useI18n();
  const w = t.wizard;
  const timed = schedule.kind === "daily" || schedule.kind === "weekly";
  const days = schedule.days ?? [];
  const setKind = (kind: ScheduleKind) =>
    onSchedule({
      kind,
      time: schedule.time ?? DEFAULT_TIME,
      days: days.length ? days : DEFAULT_DAYS,
    });
  const toggleDay = (d: number) =>
    onSchedule({
      ...schedule,
      days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
    });
  const keep = (
    key: "daily" | "weekly" | "monthly",
    label: string,
    max: number,
  ) => (
    <Field label={label} htmlFor={`${idPrefix}-keep-${key}`}>
      <Input
        id={`${idPrefix}-keep-${key}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={retention[key]}
        onChange={(e) =>
          onRetention({
            ...retention,
            [key]: Math.max(0, Math.min(max, Number(e.target.value) || 0)),
          })
        }
      />
    </Field>
  );

  return (
    <div className="gx-form">
      <Field label={w.schedule} htmlFor={`${idPrefix}-kind`}>
        <div id={`${idPrefix}-kind`}>
          <Segmented<ScheduleKind>
            label={w.schedule}
            value={schedule.kind}
            onChange={setKind}
            options={[
              { key: "manual", label: w.kindManual },
              { key: "hourly", label: w.kindHourly },
              { key: "daily", label: w.kindDaily },
              { key: "weekly", label: w.kindWeekly },
            ]}
          />
        </div>
      </Field>
      {timed ? (
        <div className="gx-grid-2">
          <Field label={w.time} htmlFor={`${idPrefix}-time`}>
            <Input
              id={`${idPrefix}-time`}
              type="time"
              required
              value={schedule.time ?? ""}
              onChange={(e) =>
                onSchedule({ ...schedule, time: e.target.value })
              }
            />
          </Field>
          {schedule.kind === "weekly" ? (
            <Field
              label={w.days}
              htmlFor={`${idPrefix}-days`}
              className="gx-grid-2__full"
            >
              <div
                id={`${idPrefix}-days`}
                className="gx-segmented"
                role="group"
                aria-label={w.days}
              >
                {weekdays.map((name, d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    className={cx(
                      "gx-segmented__item",
                      days.includes(d) && "is-active",
                    )}
                    onClick={() => toggleDay(d)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
        </div>
      ) : null}
      {schedule.kind !== "manual" ? (
        <p className="gx-hint">{w.scheduleHint}</p>
      ) : null}

      <label className="gx-check">
        <input
          type="checkbox"
          className="gx-switch"
          checked={retention.enabled}
          onChange={(e) =>
            onRetention({ ...retention, enabled: e.target.checked })
          }
        />
        {w.cleanup}
      </label>
      {retention.enabled ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {keep("daily", w.keepDaily, 365)}
          {keep("weekly", w.keepWeekly, 104)}
          {keep("monthly", w.keepMonthly, 120)}
        </div>
      ) : null}
      <p className="gx-hint">{w.cleanupHint}</p>
    </div>
  );
}
