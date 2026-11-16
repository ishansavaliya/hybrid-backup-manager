"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

/** Number input with − / + buttons, clamped to [min, max]. Posts as `name`. */
export function Stepper({
  id,
  name,
  defaultValue = 1,
  min = 1,
  max = 100,
  ariaDescribedBy,
}: {
  id: string;
  name: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  ariaDescribedBy?: string;
}) {
  const [value, setValue] = useState(String(defaultValue));
  const n = Number(value);
  const set = (next: number) =>
    setValue(String(Math.min(max, Math.max(min, next))));
  return (
    <div className="gx-stepper">
      <button
        type="button"
        className="gx-stepper__btn"
        aria-label="Decrease"
        onClick={() => set((Number.isFinite(n) ? n : min) - 1)}
        disabled={Number.isFinite(n) && n <= min}
      >
        <Minus size={15} aria-hidden="true" />
      </button>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        required
        className="gx-stepper__input"
        value={value}
        aria-describedby={ariaDescribedBy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => set(Number.isFinite(n) ? Math.round(n) : min)}
      />
      <button
        type="button"
        className="gx-stepper__btn"
        aria-label="Increase"
        onClick={() => set((Number.isFinite(n) ? n : min) + 1)}
        disabled={Number.isFinite(n) && n >= max}
      >
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
