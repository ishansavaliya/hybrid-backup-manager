export const EXPIRING_WINDOW_DAYS = 10;

export type MembershipStatus = "active" | "expiring" | "expired" | "blocked";

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

export function membershipStatus(
  c: { expiresAt: Date; blocked: boolean },
  now: Date,
): MembershipStatus {
  if (c.blocked) return "blocked";
  const remaining = c.expiresAt.getTime() - now.getTime();
  if (remaining < 0) return "expired";
  if (remaining <= EXPIRING_WINDOW_DAYS * DAY_MS) return "expiring";
  return "active";
}

export function daysLeft(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
}

/** `YYYY-MM-DD` -> that day at 23:59:59 Asia/Kolkata (+05:30). */
export function endOfDayIST(date: string): Date {
  return new Date(`${date}T23:59:59+05:30`);
}

export function extendExpiry(current: Date, now: Date, months: number): Date {
  const base = current.getTime() > now.getTime() ? current : now;
  const ist = new Date(base.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(y, m, Math.min(ist.getUTCDate(), lastDay)));
  return endOfDayIST(target.toISOString().slice(0, 10));
}
