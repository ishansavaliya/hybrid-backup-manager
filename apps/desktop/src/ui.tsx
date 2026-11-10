// Small Graphite building blocks for the desktop app (classes from
// @bakvion/ui/graphite.css, shared with the admin panel).
import {
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, Inbox, X } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      className={cx(
        "gx-btn",
        `gx-btn--${variant}`,
        size === "sm" && "gx-btn--sm",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
  flush,
}: {
  className?: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={cx("gx-card", flush && "gx-card--flush", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="gx-card-header">
      <div className="gx-card-header__text">
        <h2 className="gx-card-header__title">{title}</h2>
        {description ? (
          <p className="gx-card-header__desc">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="gx-card-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx("gx-badge", tone !== "neutral" && `gx-badge--${tone}`)}>
      {dot ? <span className="gx-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function stateTone(state: string): Tone {
  if (state === "succeeded") return "success";
  if (state === "failed" || state === "interrupted") return "danger";
  if (state === "running" || state === "queued") return "warning";
  return "neutral";
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("gx-field", className)}>
      <label className="gx-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="gx-hint">{hint}</p> : null}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("gx-input", className)} {...props} />;
}

export function PasswordInput({
  id,
  showLabel,
  hideLabel,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  const label = visible ? hideLabel : showLabel;
  return (
    <div className="gx-password">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className="gx-input"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        className="gx-password__toggle"
        aria-label={label}
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

/** Inline success / error message, optionally dismissible. */
export function Notice({
  kind,
  children,
  onClose,
  closeLabel = "Dismiss",
}: {
  kind: "ok" | "error";
  children: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      className={cx("gx-notice", `gx-notice--${kind}`, "gx-notice--inline")}
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "error" ? (
        <CircleAlert size={18} aria-hidden="true" />
      ) : (
        <CircleCheck size={18} aria-hidden="true" />
      )}
      <span className="gx-notice__text">{children}</span>
      {onClose ? (
        <button
          type="button"
          className="gx-notice__close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="gx-empty">
      <div className="gx-empty__icon" aria-hidden="true">
        {icon ?? <Inbox size={20} />}
      </div>
      <p className="gx-empty__title">{title}</p>
      {children ? <p className="gx-empty__desc">{children}</p> : null}
      {action ? <div className="gx-empty__action">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="gx-page-header">
      <div className="gx-page-header__text">
        <h1 className="gx-page-header__title">{title}</h1>
        {subtitle ? (
          <p className="gx-page-header__subtitle">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="gx-page-header__actions">{actions}</div>
      ) : null}
    </div>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
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
        </button>
      ))}
    </div>
  );
}
