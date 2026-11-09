import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashLoginCode } from "./codes";
import { refreshLicense, signIn, signOut } from "./device-api";
import type { ServerEnv } from "./env";
import { verifyLicense } from "./license";
import { hashPassword } from "./passwords";
import type { ClientRecord } from "./repo";
import { createMemoryRepo } from "./testing/memory-repo";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUB = Buffer.from(
  publicKey.export({ format: "jwk" }).x as string,
  "base64url",
).toString("base64");
const env: ServerEnv = {
  supabaseUrl: "http://x",
  supabaseSecretKey: "x",
  adminUsername: "a",
  adminPassword: "b",
  sessionSecret: "session-secret",
  licensePrivateKey: privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  cronSecret: "c",
};

const now = new Date("2026-11-10T06:00:00.000Z");
const ctx = { ip: "1.2.3.4", now };
const install = (n: number) => n.toString(16).padStart(32, "0");
const device = (n = 1) => ({
  installId: install(n),
  machineName: "PC",
  windowsVersion: "Win11",
  appVersion: "1.0.0",
});

function client(over: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: "c1",
    name: "Acme",
    contactPerson: "",
    phone: "",
    notes: "",
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    pcLimit: 1,
    blocked: false,
    isTest: false,
    createdAt: now,
    ...over,
  };
}

let repo: ReturnType<typeof createMemoryRepo>;

async function setup(over: Partial<ClientRecord> = {}) {
  repo = createMemoryRepo({ clients: [client(over)] });
  await repo.setLogin("c1", "acme", await hashPassword("pw-123456"));
  await repo.setSetting("renew_contact", "call 123");
}

const pw = (password = "pw-123456", username = "acme", d = device()) => ({
  method: "password",
  username,
  password,
  device: d,
});
const code = (c: string, d = device()) => ({
  method: "code",
  code: c,
  device: d,
});

type Ok = { deviceToken: string; license: string; mode: string };

beforeEach(() => setup());

describe("password sign-in", () => {
  it("signs in and issues a verifiable license", async () => {
    const r = await signIn(repo, env, pw(), ctx);
    expect(r.status).toBe(200);
    const b = r.body as Ok;
    expect(b.mode).toBe("full");
    const p = verifyLicense(b.license, PUB)!;
    expect(p.clientId).toBe("c1");
    expect(p.status).toBe("active");
    expect(p.expiresAt).toBe("2027-01-01T00:00:00.000Z");
    expect(p.issuedAt).toBe(now.toISOString());
    expect(p.renewContact).toBe("call 123");
    expect(p.deviceId).toBe(repo.devices[0].id);
  });

  it("rejects wrong password and unknown user, records failures", async () => {
    const spy = vi.spyOn(repo, "recordFailure");
    const bad = await signIn(repo, env, pw("nope"), ctx);
    expect(bad.status).toBe(401);
    expect(bad.body).toMatchObject({ error: { code: "invalid_credentials" } });
    expect(spy).toHaveBeenCalledWith("signin:ip:1.2.3.4", 900, now);
    expect(spy).toHaveBeenCalledWith("signin:user:acme", 900, now);
    const unknown = await signIn(repo, env, pw("x", "ghost"), ctx);
    expect(unknown.body).toMatchObject({
      error: { code: "invalid_credentials" },
    });
    expect(
      (await repo.listAudit({ limit: 10 })).some(
        (a) => a.action === "sign_in_failed",
      ),
    ).toBe(true);
  });

  it("rate limits the 6th try for a username even with the right password", async () => {
    for (let i = 0; i < 5; i++) await signIn(repo, env, pw("nope"), ctx);
    const r = await signIn(repo, env, pw(), ctx);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("returns 409 pc_limit mentioning the limit", async () => {
    await signIn(repo, env, pw(), ctx);
    const r = await signIn(repo, env, pw("pw-123456", "acme", device(2)), ctx);
    expect(r.status).toBe(409);
    const body = r.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe("pc_limit");
    expect(body.error.message).toContain("1");
  });

  it("expired client gets restore_only; blocked client license is blocked", async () => {
    await setup({ expiresAt: new Date("2026-01-01T00:00:00.000Z") });
    const r = await signIn(repo, env, pw(), ctx);
    expect(r.status).toBe(200);
    expect((r.body as Ok).mode).toBe("restore_only");
    await setup({ blocked: true });
    const b = await signIn(repo, env, pw(), ctx);
    expect(verifyLicense((b.body as Ok).license, PUB)!.status).toBe("blocked");
  });
});

describe("code sign-in", () => {
  async function seedCode(c = "123456") {
    await repo.createLoginCode(
      "c1",
      hashLoginCode(c, env.sessionSecret),
      new Date(now.getTime() + 3_600_000),
    );
  }

  it("accepts a code (with spaces), then rejects reuse", async () => {
    await seedCode();
    const r = await signIn(repo, env, code("12 34 56"), ctx);
    expect(r.status).toBe(200);
    expect(verifyLicense((r.body as Ok).license, PUB)).not.toBeNull();
    const again = await signIn(repo, env, code("123456", device(2)), ctx);
    expect(again.status).toBe(401);
    expect(again.body).toMatchObject({ error: { code: "code_invalid" } });
  });

  it("malformed code never reaches signInWithCode", async () => {
    const spy = vi.spyOn(repo, "signInWithCode");
    const r = await signIn(repo, env, code("abc"), ctx);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: { code: "code_invalid" } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rate limits the 6th failing code from one IP", async () => {
    for (let i = 0; i < 5; i++) await signIn(repo, env, code("000000"), ctx);
    await seedCode();
    const r = await signIn(repo, env, code("123456"), ctx);
    expect(r.status).toBe(429);
  });
});

describe("license refresh and sign-out", () => {
  async function token() {
    return ((await signIn(repo, env, pw(), ctx)).body as Ok).deviceToken;
  }

  it("refreshes and touches the device", async () => {
    const t = await token();
    const spy = vi.spyOn(repo, "touchDevice");
    const audit = vi.spyOn(repo, "audit");
    const r = await refreshLicense(repo, env, t, { appVersion: "1.2.3" }, ctx);
    expect(r.status).toBe(200);
    expect(verifyLicense((r.body as Ok).license, PUB)).not.toBeNull();
    expect(spy).toHaveBeenCalledWith(repo.devices[0].id, "1.2.3", now);
    expect(audit).not.toHaveBeenCalled();
  });

  it("rejects garbage bearer and removed devices", async () => {
    const t = await token();
    const g = await refreshLicense(
      repo,
      env,
      "garbage",
      { appVersion: "1" },
      ctx,
    );
    expect(g.status).toBe(401);
    expect(g.body).toMatchObject({ error: { code: "unauthorized" } });
    const n = await refreshLicense(repo, env, null, { appVersion: "1" }, ctx);
    expect(n.body).toMatchObject({ error: { code: "unauthorized" } });
    await repo.removeDevice(repo.devices[0].id, now);
    const r = await refreshLicense(repo, env, t, { appVersion: "1" }, ctx);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: { code: "device_removed" } });
  });

  it("sign-out revokes the token", async () => {
    const t = await token();
    const out = await signOut(repo, t, ctx);
    expect(out).toEqual({ status: 200, body: { ok: true } });
    const r = await refreshLicense(repo, env, t, { appVersion: "1" }, ctx);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: { code: "device_removed" } });
  });
});

describe("renewal after an expired sign-in", () => {
  const expired = { expiresAt: new Date("2026-01-01T00:00:00.000Z") };
  const renewed = new Date("2028-01-01T00:00:00.000Z");

  it("unlocks at the next refresh when a slot is free", async () => {
    await setup(expired);
    const t = ((await signIn(repo, env, pw(), ctx)).body as Ok).deviceToken;
    expect(repo.devices[0].mode).toBe("restore_only");
    await repo.updateClient("c1", { expiresAt: renewed });
    const r = await refreshLicense(repo, env, t, { appVersion: "1" }, ctx);
    const body = r.body as Ok;
    expect(body.mode).toBe("full");
    expect(verifyLicense(body.license, PUB)!.mode).toBe("full");
    expect((await repo.listClients())[0].pcsUsed).toBe(1);
  });

  it("stays restore_only when another PC holds the only slot", async () => {
    await setup(expired);
    const t = ((await signIn(repo, env, pw(), ctx)).body as Ok).deviceToken;
    await repo.updateClient("c1", { expiresAt: renewed });
    const other = await signIn(
      repo,
      env,
      pw("pw-123456", "acme", device(2)),
      ctx,
    );
    expect((other.body as Ok).mode).toBe("full");
    const r = await refreshLicense(repo, env, t, { appVersion: "1" }, ctx);
    const body = r.body as Ok;
    expect(body.mode).toBe("restore_only");
    expect(verifyLicense(body.license, PUB)!.mode).toBe("restore_only");
    expect((await repo.listClients())[0].pcsUsed).toBe(1);
  });
});

describe("inactive membership never gets full", () => {
  for (const [label, off, on] of [
    [
      "expired",
      { expiresAt: new Date("2026-01-01T00:00:00.000Z") },
      { expiresAt: new Date("2028-01-01T00:00:00.000Z") },
    ],
    ["blocked", { blocked: true }, { blocked: false }],
  ] as const) {
    it(`${label}: restore_only while inactive, full again after renewal`, async () => {
      await setup();
      const t = ((await signIn(repo, env, pw(), ctx)).body as Ok).deviceToken;
      await repo.updateClient("c1", off);
      let r = await refreshLicense(repo, env, t, { appVersion: "1" }, ctx);
      expect((r.body as Ok).mode).toBe("restore_only");
      expect(verifyLicense((r.body as Ok).license, PUB)!.mode).toBe(
        "restore_only",
      );
      expect(repo.devices[0].mode).toBe("full");
      expect((await repo.listClients())[0].pcsUsed).toBe(1);
      await repo.updateClient("c1", on);
      r = await refreshLicense(repo, env, t, { appVersion: "1" }, ctx);
      expect((r.body as Ok).mode).toBe("full");
      expect(verifyLicense((r.body as Ok).license, PUB)!.mode).toBe("full");
      expect((await repo.listClients())[0].pcsUsed).toBe(1);
    });
  }
});

describe("validation", () => {
  it("rejects malformed bodies with 400", async () => {
    for (const body of [
      undefined,
      null,
      "x",
      { method: "password", username: "a", password: "b" },
      {
        method: "password",
        username: "a",
        password: "b",
        device: { ...device(), installId: "zz" },
      },
      {
        method: "password",
        username: "a".repeat(65),
        password: "b",
        device: device(),
      },
      { method: "nope", device: device() },
    ]) {
      const r = await signIn(repo, env, body, ctx);
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code: "bad_request" } });
    }
    const r = await refreshLicense(repo, env, "a".repeat(43), {}, ctx);
    expect(r.status).toBe(400);
  });
});
