"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "./cx";

/** Password input with an eye button that shows or hides the text. */
export function PasswordInput({
  id,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";
  return (
    <div className="gx-password">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className={cx("gx-input", className)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        className="gx-password__toggle"
        aria-label={label}
        aria-controls={id}
        title={label}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff size={18} aria-hidden="true" />
        ) : (
          <Eye size={18} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
