import { afterEach, describe, expect, it } from "vitest";
import { serverEnv } from "./env";
import {
  exactUsernameMatch,
  UsernameTakenError,
  type ClientRecord,
  type DeviceInfo,
} from "./repo";
import { createMemoryRepo } from "./testing/memory-repo";

const NOW = new Date("2026-11-10T00:00:00Z");
const dev = (installId: string): DeviceInfo => ({
  installId,
  machineName: "PC",
  windowsVersion: "Win11",
  appVersion: "1.0.0",
});

function client(over: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: "c1",
    name: "Test",
    contactPerson: "",
    phone: "",
    notes: "",
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    pcLimit: 1,
    blocked: false,
    isTest: false,
    createdAt: NOW,
    ...over,
  };
}

function setup(over: Partial<ClientRecord> = {}) {
  return createMemoryRepo({ clients: [client(over)] });
}

describe("registerDevice", () => {
  it("enforces PC limit and re-registers idempotently", async () => {
    const repo = setup();
    const a = await repo.registerDevice("c1", dev("a"), "t1", NOW);
    expect(a).toMatchObject({ outcome: "ok", mode: "full", clientId: "c1" });
    expect(await repo.registerDevice("c1", dev("b"), "t2", NOW)).toEqual({
      outcome: "pc_limit",
      pcLimit: 1,
    });
    const a2 = await repo.registerDevice("c1", dev("a"), "t3", NOW);
    expect(a2).toMatchObject({ outcome: "ok", mode: "full" });
    if (a.outcome === "ok" && a2.outcome === "ok") {
      expect(a2.deviceId).toBe(a.deviceId);
    }
    expect(repo.devices).toHaveLength(1);
  });

  it("expired client gets restore_only without using a slot", async () => {
    const repo = setup({ expiresAt: new Date("2026-11-09T00:00:00Z") });
    const r = await repo.registerDevice("c1", dev("c"), "t1", NOW);
    expect(r).toMatchObject({ outcome: "ok", mode: "restore_only" });
    expect(repo.devices.filter((d) => d.mode === "full")).toHaveLength(0);
    expect(repo.devices.filter((d) => d.mode === "restore_only")).toHaveLength(
      1,
    );
  });

  it("blocked client gets restore_only", async () => {
    const repo = setup({ blocked: true });
    expect(await repo.registerDevice("c1", dev("d"), "t1", NOW)).toMatchObject({
      outcome: "ok",
      mode: "restore_only",
    });
  });

  it("throws for an unknown client", async () => {
    const repo = setup();
    await expect(
      repo.registerDevice("nope", dev("a"), "t1", NOW),
    ).rejects.toThrow("Client not found");
  });

  it("re-registering a removed device restores it", async () => {
    const repo = setup();
    const a = await repo.registerDevice("c1", dev("a"), "t1", NOW);
    if (a.outcome !== "ok") throw new Error("expected ok");
    await repo.removeDevice(a.deviceId, NOW);
    await repo.registerDevice("c1", dev("a"), "t2", NOW);
    expect(repo.devices[0]!.removedAt).toBeNull();
    expect(await repo.deviceByToken("t2")).not.toBeNull();
  });
});

describe("signInWithCode", () => {
  it("is single use, honours expiry, keeps code unused on pc_limit", async () => {
    const repo = setup();
    expect(
      await repo.createLoginCode("c1", "h1", new Date("2026-11-12T00:00:00Z")),
    ).toBe(true);
    const ok = await repo.signInWithCode("h1", dev("p1"), "t1", NOW);
    expect(ok).toMatchObject({ outcome: "ok", clientId: "c1", mode: "full" });
    expect(await repo.signInWithCode("h1", dev("p1"), "t2", NOW)).toEqual({
      outcome: "code_invalid",
    });

    await repo.createLoginCode("c1", "h-old", new Date("2026-11-09T00:00:00Z"));
    expect(
      (await repo.signInWithCode("h-old", dev("p1"), "t3", NOW)).outcome,
    ).toBe("code_invalid");

    await repo.createLoginCode(
      "c1",
      "h-full",
      new Date("2026-11-12T00:00:00Z"),
    );
    expect(await repo.signInWithCode("h-full", dev("p2"), "t4", NOW)).toEqual({
      outcome: "pc_limit",
      pcLimit: 1,
    });
    const code = [...repo.codes.values()].find((c) => c.codeHmac === "h-full");
    expect(code!.usedAt).toBeNull();
  });

  it("expired client: restore_only and code consumed", async () => {
    const repo = setup({ expiresAt: new Date("2026-11-09T00:00:00Z") });
    await repo.createLoginCode("c1", "h-exp", new Date("2026-11-12T00:00:00Z"));
    const r = await repo.signInWithCode("h-exp", dev("pe"), "t1", NOW);
    expect(r).toMatchObject({ outcome: "ok", mode: "restore_only" });
    const code = [...repo.codes.values()].find((c) => c.codeHmac === "h-exp");
    expect(code!.usedAt).not.toBeNull();
  });
});

describe("createLoginCode", () => {
  it("rejects an active duplicate but reuses a stale expired value", async () => {
    const repo = setup();
    const future = new Date(Date.now() + 3_600_000);
    expect(await repo.createLoginCode("c1", "dup", future)).toBe(true);
    expect(await repo.createLoginCode("c1", "dup", future)).toBe(false);

    expect(
      await repo.createLoginCode(
        "c1",
        "stale",
        new Date("2000-01-01T00:00:00Z"),
      ),
    ).toBe(true);
    expect(await repo.createLoginCode("c1", "stale", future)).toBe(true);
    expect(
      [...repo.codes.values()].filter((c) => c.codeHmac === "stale"),
    ).toHaveLength(1);
  });
});

describe("rate limits", () => {
  it("blocks after max failures and resets after the window", async () => {
    const repo = setup();
    for (let i = 0; i < 5; i++) await repo.recordFailure("k", 900, NOW);
    expect(await repo.rateLimited("k", 5, 900, NOW)).toBe(true);
    expect(
      await repo.rateLimited("k", 5, 900, new Date(NOW.getTime() + 901_000)),
    ).toBe(false);
  });

  it("below max is not limited", async () => {
    const repo = setup();
    for (let i = 0; i < 4; i++) await repo.recordFailure("k4", 900, NOW);
    expect(await repo.rateLimited("k4", 5, 900, NOW)).toBe(false);
  });

  it("failure after window expiry resets the count to 1", async () => {
    const repo = setup();
    for (let i = 0; i < 5; i++) await repo.recordFailure("kr", 900, NOW);
    await repo.recordFailure("kr", 900, new Date(NOW.getTime() + 901_000));
    expect(
      await repo.rateLimited("kr", 2, 900, new Date(NOW.getTime() + 901_000)),
    ).toBe(false);
    await repo.recordFailure("kr", 900, new Date(NOW.getTime() + 902_000));
    expect(
      await repo.rateLimited("kr", 2, 900, new Date(NOW.getTime() + 902_000)),
    ).toBe(true);
  });
});

describe("promoteDevice", () => {
  const LATER = new Date("2027-06-01T00:00:00Z");
  const renewed = new Date("2028-01-01T00:00:00Z");
  const expired = { expiresAt: new Date("2026-01-01T00:00:00Z") };

  it("promotes with a free slot once the client is renewed", async () => {
    const repo = setup(expired);
    const a = await repo.registerDevice("c1", dev("a"), "ta", NOW);
    if (a.outcome !== "ok") throw new Error("expected ok");
    expect(await repo.promoteDevice(a.deviceId, NOW)).toBe("restore_only");
    await repo.updateClient("c1", { expiresAt: renewed });
    expect(await repo.promoteDevice(a.deviceId, LATER)).toBe("full");
    expect(await repo.promoteDevice(a.deviceId, LATER)).toBe("full");
  });

  it("stays restore_only when the limit is reached", async () => {
    const repo = setup(expired);
    const a = await repo.registerDevice("c1", dev("a"), "ta", NOW);
    await repo.updateClient("c1", { expiresAt: renewed });
    const b = await repo.registerDevice("c1", dev("b"), "tb", LATER);
    if (a.outcome !== "ok" || b.outcome !== "ok")
      throw new Error("expected ok");
    expect(await repo.promoteDevice(a.deviceId, LATER)).toBe("restore_only");
  });

  it("leaves blocked clients unchanged and reports removed devices", async () => {
    const repo = setup(expired);
    const a = await repo.registerDevice("c1", dev("a"), "ta", NOW);
    if (a.outcome !== "ok") throw new Error("expected ok");
    await repo.updateClient("c1", { expiresAt: renewed, blocked: true });
    expect(await repo.promoteDevice(a.deviceId, LATER)).toBe("restore_only");
    await repo.removeDevice(a.deviceId, LATER);
    expect(await repo.promoteDevice(a.deviceId, LATER)).toBe("removed");
    expect(await repo.promoteDevice("nope", LATER)).toBe("removed");
  });
});

describe("devices and tokens", () => {
  it("revoked token or removed device resolves to null", async () => {
    const repo = setup({ pcLimit: 2 });
    const a = await repo.registerDevice("c1", dev("a"), "ta", NOW);
    const b = await repo.registerDevice("c1", dev("b"), "tb", NOW);
    if (a.outcome !== "ok" || b.outcome !== "ok")
      throw new Error("expected ok");
    expect((await repo.deviceByToken("ta"))?.client.id).toBe("c1");
    await repo.revokeToken("ta", NOW);
    expect(await repo.deviceByToken("ta")).toBeNull();
    await repo.removeDevice(b.deviceId, NOW);
    expect(await repo.deviceByToken("tb")).toBeNull();
  });

  it("touchDevice updates version and last seen", async () => {
    const repo = setup();
    const a = await repo.registerDevice("c1", dev("a"), "ta", NOW);
    if (a.outcome !== "ok") throw new Error("expected ok");
    const later = new Date(NOW.getTime() + 60_000);
    await repo.touchDevice(a.deviceId, "2.0.0", later);
    const found = await repo.deviceByToken("ta");
    expect(found?.device.appVersion).toBe("2.0.0");
    expect(found?.device.lastSeenAt).toEqual(later);
  });

  it("removed device frees its slot", async () => {
    const repo = setup();
    const a = await repo.registerDevice("c1", dev("a"), "ta", NOW);
    if (a.outcome !== "ok") throw new Error("expected ok");
    await repo.removeDevice(a.deviceId, NOW);
    expect((await repo.registerDevice("c1", dev("b"), "tb", NOW)).outcome).toBe(
      "ok",
    );
  });
});

describe("logins and clients", () => {
  it("findLogin is case-insensitive and usernames are unique", async () => {
    const repo = createMemoryRepo({
      clients: [client(), client({ id: "c2" })],
    });
    await repo.setLogin("c1", "Alice", "hash1");
    expect(await repo.findLogin("aLiCe")).toEqual({
      clientId: "c1",
      passwordHash: "hash1",
    });
    await expect(repo.setLogin("c2", "ALICE", "h")).rejects.toBeInstanceOf(
      UsernameTakenError,
    );
    await repo.setLogin("c1", "alice", "hash2");
    expect((await repo.findLogin("alice"))?.passwordHash).toBe("hash2");
  });

  it("findLogin never treats wildcards as patterns", async () => {
    const repo = setup();
    await repo.setLogin("c1", "alice", "h");
    for (const q of ["al*", "a%", "a_ice", "ali", ""]) {
      expect(await repo.findLogin(q)).toBeNull();
    }
    expect(exactUsernameMatch([{ username: "alice" }], "al*")).toBeNull();
    expect(
      exactUsernameMatch([{ username: "bob" }, { username: "Alice" }], "ALICE"),
    ).toEqual({
      username: "Alice",
    });
  });

  it("listClients summarises usage; update and delete work", async () => {
    const repo = setup({ pcLimit: 2 });
    await repo.setLogin("c1", "bob", "h");
    await repo.registerDevice("c1", dev("a"), "ta", NOW);
    const [s] = await repo.listClients();
    expect(s).toMatchObject({ username: "bob", pcsUsed: 1, lastSeenAt: NOW });
    await repo.updateClient("c1", { name: "Renamed", blocked: true });
    expect(await repo.getClient("c1")).toMatchObject({
      name: "Renamed",
      blocked: true,
    });
    await repo.deleteClient("c1");
    expect(await repo.getClient("c1")).toBeNull();
    expect(await repo.findLogin("bob")).toBeNull();
  });

  it("createClient returns an id", async () => {
    const repo = createMemoryRepo();
    const input: Partial<ClientRecord> = client();
    delete input.id;
    delete input.createdAt;
    const id = await repo.createClient(
      input as Omit<ClientRecord, "id" | "createdAt">,
    );
    expect((await repo.getClient(id))?.name).toBe("Test");
  });
});

describe("audit and settings", () => {
  it("lists newest first, filters by client, prunes old rows", async () => {
    const repo = setup();
    await repo.audit({ actor: "admin", action: "a1", clientId: "c1" });
    await repo.audit({ actor: "system", action: "a2" });
    const all = await repo.listAudit({ limit: 10 });
    expect(all.map((e) => e.action)).toEqual(["a2", "a1"]);
    expect(await repo.listAudit({ clientId: "c1", limit: 10 })).toHaveLength(1);
    expect(await repo.listAudit({ limit: 1 })).toHaveLength(1);
    expect(await repo.pruneAudit(new Date("2000-01-01"))).toBe(0);
    expect(await repo.pruneAudit(new Date(Date.now() + 1000))).toBe(2);
  });

  it("settings default to empty and persist", async () => {
    const repo = setup();
    expect(await repo.getSetting("renew_contact")).toBe("");
    await repo.setSetting("renew_contact", "call me");
    expect(await repo.getSetting("renew_contact")).toBe("call me");
    await repo.ping();
  });
});

describe("serverEnv", () => {
  const names = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "BKP_ADMIN_USERNAME",
    "BKP_ADMIN_PASSWORD",
    "BKP_SESSION_SECRET",
    "LICENSE_SIGNING_PRIVATE_KEY",
    "CRON_SECRET",
  ];
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads all variables", () => {
    for (const n of names) process.env[n] = `v-${n}`;
    expect(serverEnv()).toMatchObject({
      supabaseUrl: "v-SUPABASE_URL",
      cronSecret: "v-CRON_SECRET",
    });
  });

  it("names the missing variable but never a value", () => {
    for (const n of names) process.env[n] = "secret-value";
    delete process.env.BKP_SESSION_SECRET;
    expect(() => serverEnv()).toThrow(
      "Missing server setting: BKP_SESSION_SECRET",
    );
    try {
      serverEnv();
    } catch (e) {
      expect(String(e)).not.toContain("secret-value");
    }
  });
});
