import type { MembershipStatus } from "../../../lib/server/membership";

export const STATUS_TONE: Record<
  MembershipStatus,
  "success" | "warning" | "danger"
> = {
  active: "success",
  expiring: "warning",
  expired: "danger",
  blocked: "danger",
};

const DATE = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDate(d: Date): string {
  return DATE.format(d);
}

export function formatDateTime(d: Date): string {
  return DATE_TIME.format(d);
}

/** `YYYY-MM-DD` of the given instant in Asia/Kolkata (for date inputs). */
export function istDateInput(d: Date): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function daysAgo(d: Date, now: Date): string {
  const n = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (n <= 0) return "today";
  return n === 1 ? "1 day ago" : `${n} days ago`;
}
