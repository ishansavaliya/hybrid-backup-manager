"use client";

import { useState, type TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

/** Textarea with a live "n / max" counter under it. */
export function CountedTextarea({
  maxLength,
  defaultValue,
  className,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "defaultValue"> & {
  maxLength: number;
  defaultValue?: string;
}) {
  const [len, setLen] = useState((defaultValue ?? "").length);
  return (
    <div className="gx-counted">
      <textarea
        {...props}
        maxLength={maxLength}
        defaultValue={defaultValue}
        className={cx("gx-textarea", className)}
        onChange={(e) => {
          setLen(e.target.value.length);
          props.onChange?.(e);
        }}
      />
      <span className="gx-counted__count" aria-live="polite">
        {len} / {maxLength}
      </span>
    </div>
  );
}
