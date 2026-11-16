"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { cx } from "./cx";

/**
 * Success / error message. `toast` (default) floats top-right above the top
 * bar and can be dismissed; `inline` sits in the flow (e.g. inside a form).
 * Typically fed from `?ok=` / `?error=` search params.
 */
export function Notice({
  ok,
  error,
  variant = "toast",
}: {
  ok?: string | null;
  error?: string | null;
  variant?: "toast" | "inline";
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const message = error || ok || null;
  if (!message) return null;
  const kind = error ? "error" : "ok";
  const key = `${kind}:${message}`;
  if (variant === "toast" && dismissed === key) return null;

  const body = (
    <div
      className={cx("gx-notice", `gx-notice--${kind}`, `gx-notice--${variant}`)}
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "error" ? (
        <CircleAlert size={18} aria-hidden="true" />
      ) : (
        <CircleCheck size={18} aria-hidden="true" />
      )}
      <span className="gx-notice__text">{message}</span>
      {variant === "toast" ? (
        <button
          type="button"
          className="gx-notice__close"
          aria-label="Dismiss"
          onClick={() => setDismissed(key)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
  return variant === "toast" ? <div className="gx-toasts">{body}</div> : body;
}
