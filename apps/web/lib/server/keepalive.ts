import { createHash, timingSafeEqual } from "node:crypto";
import type { Repo } from "./repo";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIT_RETENTION_DAYS = 90;
const RATE_LIMIT_RETENTION_DAYS = 1;
const REPORT_RETENTION_DAYS = 90;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Accepts exactly `Bearer <secret>`; constant-time; never true for an empty secret. */
export function authorizeCron(
  authHeader: string | null,
  secret: string,
): boolean {
  if (!secret || authHeader === null) return false;
  return timingSafeEqual(sha256(authHeader), sha256(`Bearer ${secret}`));
}

/** Pings the database (keeps Supabase Free awake) and purges old rows. */
export async function runKeepalive(
  repo: Repo,
  now: Date,
): Promise<{
  pruned: number;
  prunedRateLimits: number;
  prunedReports: number;
}> {
  await repo.ping();
  const pruned = await repo.pruneAudit(
    new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS),
  );
  const prunedRateLimits = await repo.pruneRateLimits(
    new Date(now.getTime() - RATE_LIMIT_RETENTION_DAYS * DAY_MS),
  );
  const prunedReports = await repo.pruneReports(
    new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS),
  );
  return { pruned, prunedRateLimits, prunedReports };
}
