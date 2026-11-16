import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadInfo, formatSize, LATEST_INSTALLER } from "./release";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const respond = (body: unknown, ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );

describe("download info", () => {
  it("uses the published release", async () => {
    respond({ version: "0.3.0", size: 24_600_000 });
    expect(await downloadInfo()).toEqual({
      url: LATEST_INSTALLER,
      version: "0.3.0",
      size: "25 MB",
    });
  });

  it("falls back to settings when the release can't be read", async () => {
    respond({}, false);
    vi.stubEnv("NEXT_PUBLIC_DOWNLOAD_URL", "https://example.com/setup.exe");
    vi.stubEnv("NEXT_PUBLIC_DOWNLOAD_VERSION", "0.1.0");
    expect(await downloadInfo()).toMatchObject({
      url: "https://example.com/setup.exe",
      version: "0.1.0",
    });
  });

  it("shows 'coming soon' with neither", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    vi.stubEnv("NEXT_PUBLIC_DOWNLOAD_URL", "");
    expect(await downloadInfo()).toBeNull();
  });

  it("ignores a malformed release file", async () => {
    respond({ version: "latest" });
    vi.stubEnv("NEXT_PUBLIC_DOWNLOAD_URL", "");
    expect(await downloadInfo()).toBeNull();
  });

  it("rounds sizes to MB", () => {
    expect(formatSize(400_000)).toBe("1 MB");
    expect(formatSize(31_490_000)).toBe("31 MB");
  });
});
