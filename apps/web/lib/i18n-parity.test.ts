import { describe, expect, it } from "vitest";
import { LANGS, messages } from "@bakvion/i18n";

function keys(o: unknown, prefix = ""): string[] {
  if (!o || typeof o !== "object") return [prefix];
  return Object.entries(o).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("website translations", () => {
  it("hi and gu have exactly the English keys, none empty", () => {
    const en = keys(messages("en")).sort();
    for (const lang of LANGS) {
      expect(keys(messages(lang)).sort()).toEqual(en);
      for (const k of en) {
        const v = k
          .split(".")
          .reduce<unknown>(
            (o, p) => (o as Record<string, unknown>)[p],
            messages(lang),
          );
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${lang}:${k}`,
        ).toBe(true);
      }
    }
  });
});
