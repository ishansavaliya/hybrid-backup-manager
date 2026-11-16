"use client";

import { cx } from "./cx";

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/** Pill tabs used as filters (All / Expiring / …), with optional counts. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="gx-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          className={cx("gx-segmented__item", o.key === value && "is-active")}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.count !== undefined ? (
            <span className="gx-segmented__count">{o.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
