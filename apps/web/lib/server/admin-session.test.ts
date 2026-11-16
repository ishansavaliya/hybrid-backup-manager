import { describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_HOURS,
  checkAdminCredentials,
  createAdminSession,
  verifyAdminSession,
} from "./admin-session";
import type { ServerEnv } from "./env";

const env: ServerEnv = {
  supabaseUrl: "http://x",
  supabaseSecretKey: "k",
  adminUsername: "owner",
  adminPassword: "correct horse",
  sessionSecret: "secret-one",
  licensePrivateKey: "l",
  cronSecret: "c",
};
const now = new Date("2026-01-01T00:00:00Z");

describe("checkAdminCredentials", () => {
  it("accepts the right username and password", () => {
    expect(checkAdminCredentials("owner", "correct horse", env)).toBe(true);
  });
  it("rejects wrong username", () => {
    expect(checkAdminCredentials("nope", "correct horse", env)).toBe(false);
  });
  it("rejects wrong password", () => {
    expect(checkAdminCredentials("owner", "wrong", env)).toBe(false);
  });
  it("rejects different-length strings", () => {
    expect(checkAdminCredentials("o", "c", env)).toBe(false);
    expect(checkAdminCredentials("owner", "correct horse and more", env)).toBe(
      false,
    );
  });
});

describe("admin session", () => {
  it("exposes constants", () => {
    expect(ADMIN_COOKIE).toBe("bkp_admin");
    expect(ADMIN_SESSION_HOURS).toBe(12);
  });
  it("verifies before expiry", () => {
    const s = createAdminSession(env, now);
    expect(
      verifyAdminSession(s, env, new Date(now.getTime() + 11 * 3600e3)),
    ).toBe(true);
  });
  it("fails after 12 hours", () => {
    const s = createAdminSession(env, now);
    expect(
      verifyAdminSession(s, env, new Date(now.getTime() + 12 * 3600e3)),
    ).toBe(false);
    expect(
      verifyAdminSession(s, env, new Date(now.getTime() + 13 * 3600e3)),
    ).toBe(false);
  });
  it("fails with a tampered HMAC", () => {
    const s = createAdminSession(env, now);
    const last = s.slice(-1) === "0" ? "1" : "0";
    expect(verifyAdminSession(s.slice(0, -1) + last, env, now)).toBe(false);
  });
  it("fails with a tampered expiry", () => {
    const [exp, mac] = createAdminSession(env, now).split(".");
    const later = String(Number(exp) + 3600e3);
    expect(verifyAdminSession(`${later}.${mac}`, env, now)).toBe(false);
  });
  it("fails with another secret", () => {
    const s = createAdminSession(env, now);
    expect(verifyAdminSession(s, { ...env, sessionSecret: "other" }, now)).toBe(
      false,
    );
  });
  it("fails for undefined, empty and malformed", () => {
    expect(verifyAdminSession(undefined, env, now)).toBe(false);
    expect(verifyAdminSession("", env, now)).toBe(false);
    expect(verifyAdminSession("garbage", env, now)).toBe(false);
    expect(verifyAdminSession("abc.def", env, now)).toBe(false);
  });
});
