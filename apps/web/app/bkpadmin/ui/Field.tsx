import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { cx } from "./cx";

/** Ids Field gives its hint and error, for the control's aria-describedby. */
export function fieldDescribedBy(
  id: string,
  { hint, error }: { hint?: ReactNode; error?: ReactNode },
): string | undefined {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(
    Boolean,
  );
  return ids.length ? ids.join(" ") : undefined;
}

/**
 * Label + control + optional hint and error. `htmlFor` must match the
 * control's `id`; pass `fieldDescribedBy(id, { hint, error })` to the
 * control's `aria-describedby`.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("gx-field", className)}>
      <label className="gx-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="gx-label__req" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="gx-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="gx-field-error" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input className={cx("gx-input", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("gx-textarea", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="gx-select-wrap">
      <select className={cx("gx-select", className)} {...props}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </div>
  );
}

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

export function Checkbox({ label, className, ...props }: ToggleProps) {
  return (
    <label className={cx("gx-check", className)}>
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}

/** A checkbox drawn as an on/off switch; posts like a normal checkbox. */
export function Switch({ label, className, ...props }: ToggleProps) {
  return (
    <label className={cx("gx-check", className)}>
      <input type="checkbox" role="switch" className="gx-switch" {...props} />
      {label}
    </label>
  );
}
