import { describe, it, expect } from "vitest";
import { planSchema } from "./index";
describe("plan boundary", () => {
  it("rejects empty sources and destinations", () =>
    expect(
      planSchema.safeParse({
        id: "p",
        name: "Plan",
        sources: [],
        destinations: [],
      }).success,
    ).toBe(false));
  it("rejects identifier traversal", () =>
    expect(
      planSchema.safeParse({
        id: "../p",
        name: "Plan",
        sources: ["C:/data"],
        destinations: [],
      }).success,
    ).toBe(false));
  const base = {
    id: "p",
    name: "Plan",
    sources: ["C:/data"],
    destinations: [{ id: "d", name: "Disk", repository: "E:/Bakvion" }],
  };
  it("defaults to a managed key, manual schedule and cleanup off", () => {
    const p = planSchema.parse(base);
    expect(p.destinations[0].passwordFile).toBe("");
    expect(p.schedule.kind).toBe("manual");
    expect(p.retention.enabled).toBe(false);
  });
  it("needs a time for daily and days for weekly", () => {
    const at = (schedule: unknown) =>
      planSchema.safeParse({ ...base, schedule }).success;
    expect(at({ kind: "daily" })).toBe(false);
    expect(at({ kind: "daily", time: "24:00" })).toBe(false);
    expect(at({ kind: "daily", time: "21:30" })).toBe(true);
    expect(at({ kind: "weekly", time: "09:00", days: [] })).toBe(false);
    expect(at({ kind: "weekly", time: "09:00", days: [1, 5] })).toBe(true);
  });
  it("rejects cleanup that keeps nothing", () =>
    expect(
      planSchema.safeParse({
        ...base,
        retention: { enabled: true, daily: 0, weekly: 0, monthly: 0 },
      }).success,
    ).toBe(false));
});
