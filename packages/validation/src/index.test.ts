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
});
