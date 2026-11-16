import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateLoginCode, hashLoginCode, normalizeLoginCode } from "./codes";
import { signLicense, verifyLicense, type LicensePayload } from "./license";
import {
  daysLeft,
  endOfDayIST,
  extendExpiry,
  membershipStatus,
} from "./membership";
import { hashPassword, verifyPassword } from "./passwords";
import { generateDeviceToken, hashToken } from "./tokens";

const DAY = 86_400_000;

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  return {
    priv: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    pub: Buffer.from(jwk.x as string, "base64url").toString("base64"),
  };
}

describe("passwords", () => {
  it("round trips and rejects wrong/malformed", async () => {
    const stored = await hashPassword("s3cret!");
    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("s3cret!", stored)).toBe(true);
    expect(await verifyPassword("nope", stored)).toBe(false);
    expect(await verifyPassword("s3cret!", "garbage")).toBe(false);
    expect(await verifyPassword("s3cret!", "scrypt$1$2$3$a$b")).toBe(false);
  });
});

describe("login codes", () => {
  it("normalizes", () => {
    expect(normalizeLoginCode(" 123 456 ")).toBe("123456");
    expect(normalizeLoginCode("12345")).toBeNull();
    expect(normalizeLoginCode("12a456")).toBeNull();
    expect(normalizeLoginCode("1234567")).toBeNull();
  });
  it("generates 6 digits", () => {
    for (let i = 0; i < 200; i++)
      expect(generateLoginCode()).toMatch(/^\d{6}$/);
  });
  it("hashes deterministically per secret", () => {
    expect(hashLoginCode("123456", "a")).toBe(hashLoginCode("123456", "a"));
    expect(hashLoginCode("123456", "a")).not.toBe(hashLoginCode("123456", "b"));
  });
});

describe("tokens", () => {
  it("generates and hashes", () => {
    const t = generateDeviceToken();
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(generateDeviceToken()).not.toBe(t);
  });
});

describe("membership", () => {
  const expiresAt = new Date("2026-12-31T18:29:59.000Z");
  it("status windows", () => {
    const at = (ms: number) => new Date(expiresAt.getTime() + ms);
    expect(membershipStatus({ expiresAt, blocked: false }, at(-11 * DAY))).toBe(
      "active",
    );
    expect(membershipStatus({ expiresAt, blocked: false }, at(-10 * DAY))).toBe(
      "expiring",
    );
    expect(membershipStatus({ expiresAt, blocked: false }, at(1000))).toBe(
      "expired",
    );
    expect(membershipStatus({ expiresAt, blocked: true }, at(-30 * DAY))).toBe(
      "blocked",
    );
    expect(membershipStatus({ expiresAt, blocked: true }, at(1000))).toBe(
      "blocked",
    );
  });
  it("daysLeft", () => {
    expect(daysLeft(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(1);
    expect(daysLeft(expiresAt, new Date(expiresAt.getTime() + DAY))).toBe(0);
  });
  it("endOfDayIST", () => {
    expect(endOfDayIST("2026-12-31").toISOString()).toBe(
      "2026-12-31T18:29:59.000Z",
    );
  });
  it("extendExpiry from later of current/now", () => {
    const now = new Date("2026-06-10T05:00:00.000Z");
    expect(
      extendExpiry(new Date("2026-01-01T00:00:00Z"), now, 1).toISOString(),
    ).toBe("2026-07-10T18:29:59.000Z");
    expect(
      extendExpiry(new Date("2026-12-31T18:29:59Z"), now, 3).toISOString(),
    ).toBe("2027-03-31T18:29:59.000Z");
  });
});

describe("license", () => {
  const payload: LicensePayload = {
    v: 1,
    clientId: "c1",
    clientName: "Acme",
    deviceId: "d1",
    status: "active",
    mode: "full",
    expiresAt: "2026-12-31T18:29:59.000Z",
    issuedAt: "2026-11-10T00:00:00.000Z",
    renewContact: "x@y.z",
  };
  it("round trips", () => {
    const k = keys();
    expect(verifyLicense(signLicense(payload, k.priv), k.pub)).toEqual(payload);
  });
  it("rejects tampering and other keys", () => {
    const k = keys();
    const token = signLicense(payload, k.priv);
    const [body, sig] = token.split(".");
    const bytes = Buffer.from(body, "base64url");
    bytes[5] ^= 1;
    expect(
      verifyLicense(`${bytes.toString("base64url")}.${sig}`, k.pub),
    ).toBeNull();
    expect(verifyLicense(token, keys().pub)).toBeNull();
    expect(verifyLicense("junk", k.pub)).toBeNull();
  });
});
