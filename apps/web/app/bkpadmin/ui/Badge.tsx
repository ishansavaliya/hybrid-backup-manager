import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

export function Badge({
  tone = "neutral",
  dot,
  title,
  children,
}: {
  tone?: BadgeTone;
  /** Leading status dot. */
  dot?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx("gx-badge", tone !== "neutral" && `gx-badge--${tone}`)}
      title={title}
    >
      {dot ? <span className="gx-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export type ClientStatus =
  "active" | "expiring" | "expired" | "blocked" | "test";

const STATUS: Record<ClientStatus, { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  expiring: { tone: "warning", label: "Expiring" },
  expired: { tone: "danger", label: "Expired" },
  blocked: { tone: "danger", label: "Blocked" },
  test: { tone: "accent", label: "Test" },
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  const { tone, label } = STATUS[status];
  return (
    <Badge tone={tone} dot={status !== "test"}>
      {label}
    </Badge>
  );
}
