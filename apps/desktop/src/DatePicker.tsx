// Calendar date picker (no library). Days that have backups carry a dot and
// are the only ones that can be chosen.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useI18n } from "./i18n";
import { cx } from "./ui";

/** Local calendar day "YYYY-MM-DD" of an instant (not UTC). */
export function localDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

export function DatePicker({
  id,
  value,
  onChange,
  marked,
  disabled,
}: {
  id: string;
  /** "YYYY-MM-DD" or "" for any date. */
  value: string;
  onChange: (day: string) => void;
  /** Days that have backups. */
  marked: Set<string>;
  disabled?: boolean;
}) {
  const { t, locale, weekdays } = useI18n();
  const r = t.restore;
  const [open, setOpen] = useState(false);
  const latest = useMemo(() => [...marked].sort().at(-1) ?? "", [marked]);
  const [month, setMonth] = useState(() =>
    parseDay(value || latest || localDay(new Date())),
  );
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes even before focus has moved into the calendar.
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>(`#${id}`)?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, id]);

  // Open on the chosen day, else the latest backup, and focus a day.
  useEffect(() => {
    if (!open) return;
    setMonth(parseDay(value || latest || localDay(new Date())));
    requestAnimationFrame(() => {
      const target =
        grid.current?.querySelector<HTMLButtonElement>(
          "button[aria-pressed='true']",
        ) ??
        grid.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      target?.focus();
    });
  }, [open, value, latest]);

  const title = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
  const full = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const shown = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from(
      { length: days },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  const shift = (n: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      e.key as "ArrowLeft"
    ];
    if (!step) return;
    e.preventDefault();
    const buttons = [
      ...(grid.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return buttons[0]?.focus();
    // Move to the nearest selectable day in that direction.
    const target = Number(buttons[at]!.dataset.day) + step;
    const day = (b: HTMLButtonElement) => Number(b.dataset.day);
    const next =
      step > 0
        ? buttons.find((b) => day(b) >= target)
        : [...buttons].reverse().find((b) => day(b) <= target);
    next?.focus();
  }

  return (
    <div className="gx-datepicker" ref={root}>
      <div className="gx-datepicker__field">
        <button
          id={id}
          type="button"
          className="gx-input gx-datepicker__trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span className={value ? undefined : "gx-muted"}>
            {value ? shown.format(parseDay(value)) : r.anyDate}
          </span>
        </button>
        {value && !disabled ? (
          <button
            type="button"
            className="gx-datepicker__clear"
            aria-label={r.clearDate}
            title={r.clearDate}
            onClick={() => onChange("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          className="gx-datepicker__panel"
          role="dialog"
          aria-label={r.pickDate}
          onKeyDown={onKey}
        >
          <div className="gx-datepicker__head">
            <button
              type="button"
              className="gx-btn gx-btn--ghost gx-btn--sm gx-btn--icon"
              aria-label={r.prevMonth}
              onClick={() => shift(-1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong aria-live="polite">{title}</strong>
            <button
              type="button"
              className="gx-btn gx-btn--ghost gx-btn--sm gx-btn--icon"
              aria-label={r.nextMonth}
              onClick={() => shift(1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="gx-datepicker__grid" aria-hidden="true">
            {weekdays.map((w) => (
              <span key={w} className="gx-datepicker__dow">
                {w}
              </span>
            ))}
          </div>
          <div className="gx-datepicker__grid" ref={grid}>
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  data-day={d.getDate()}
                  className={cx(
                    "gx-datepicker__day",
                    marked.has(localDay(d)) && "has-backup",
                    localDay(d) === localDay(new Date()) && "is-today",
                  )}
                  aria-label={full.format(d)}
                  aria-pressed={localDay(d) === value}
                  disabled={!marked.has(localDay(d))}
                  onClick={() => {
                    onChange(localDay(d));
                    setOpen(false);
                  }}
                >
                  {d.getDate()}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
