import { describe, expect, it } from "vitest";
import { authorizeCron, runKeepalive } from "./keepalive";
import { createMemoryRepo } from "./testing/memory-repo";

const NOW = new Date("2026-11-10T03:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("authorizeCron", () => {
  it("accepts exactly Bearer <secret>", () => {
    expect(authorizeCron("Bearer s3cret", "s3cret")).toBe(true);
  });
  it("rejects missing, wrong, malformed and empty-secret cases", () => {
    expect(authorizeCron(null, "s3cret")).toBe(false);
    expect(authorizeCron("", "s3cret")).toBe(false);
    expect(authorizeCron("Bearer wrong", "s3cret")).toBe(false);
    expect(authorizeCron("s3cret", "s3cret")).toBe(false);
    expect(authorizeCron("bearer s3cret", "s3cret")).toBe(false);
    expect(authorizeCron("Bearer s3cret ", "s3cret")).toBe(false);
    expect(authorizeCron("Bearer ", "")).toBe(false);
    expect(authorizeCron("", "")).toBe(false);
  });
});

describe("runKeepalive", () => {
  it("prunes audit rows older than 90 days and keeps newer ones", async () => {
    const repo = createMemoryRepo();
    await repo.audit({ actor: "system", action: "x" });
    // memory repo stamps audit rows with the real clock; move "now" forward
    const after91 = new Date(Date.now() + 91 * DAY);
    const result = await runKeepalive(repo, after91);
    expect(result.pruned).toBe(1);
    await repo.audit({ actor: "system", action: "y" });
    const after89 = new Date(Date.now() + 89 * DAY);
    expect((await runKeepalive(repo, after89)).pruned).toBe(0);
    expect(await repo.listAudit({ limit: 10 })).toHaveLength(1);
  });

  it("purges rate-limit rows older than 1 day", async () => {
    const repo = createMemoryRepo();
    await repo.recordFailure("old", 900, new Date(NOW.getTime() - 2 * DAY));
    await repo.recordFailure("fresh", 900, new Date(NOW.getTime() - 1000));
    const result = await runKeepalive(repo, NOW);
    expect(result.prunedRateLimits).toBe(1);
    expect(await repo.rateLimited("fresh", 1, 900, NOW)).toBe(true);
    expect(await repo.rateLimited("old", 1, 900, NOW)).toBe(false);
  });
});

describe("pruneRateLimits", () => {
  it("deletes only rows with window_start before the cutoff", async () => {
    const repo = createMemoryRepo();
    await repo.recordFailure("a", 900, new Date("2026-11-01T00:00:00Z"));
    await repo.recordFailure("b", 900, new Date("2026-11-09T00:00:00Z"));
    expect(await repo.pruneRateLimits(new Date("2026-11-05T00:00:00Z"))).toBe(
      1,
    );
    expect(await repo.pruneRateLimits(new Date("2026-11-05T00:00:00Z"))).toBe(
      0,
    );
  });
});
