import { describe, expect, it } from "vitest";
import {
  AdminInputError,
  GENERIC_ERROR,
  createClientAccount,
  extendMembership,
  filterClients,
  formatIST,
  issueLoginCode,
  publicErrorMessage,
  removeClientDevice,
  setBlocked,
  setCredentials,
  setExpiryDate,
  setPcLimit,
  setRenewContact,
  updateClientDetails,
} from "./admin-service";
import { hashLoginCode } from "./codes";
import { membershipStatus } from "./membership";
import type { ClientRecord, ClientSummary } from "./repo";
import { createMemoryRepo } from "./testing/memory-repo";

const now = new Date("2026-11-09T06:00:00Z");
const env = { sessionSecret: "test-secret" };

const input = {
  name: "Acme",
  contactPerson: "Ravi",
  phone: "9999999999",
  notes: "",
  expiresOn: "2027-01-31",
  pcLimit: 2,
};

async function setup() {
  const repo = createMemoryRepo();
  const id = await createClientAccount(repo, input, now);
  return { repo, id };
}

async function adminRows(
  repo: ReturnType<typeof createMemoryRepo>,
  id: string,
) {
  return repo.listAudit({ clientId: id, limit: 50 });
}

describe("createClientAccount", () => {
  it("creates an active client expiring end of day IST", async () => {
    const { repo, id } = await setup();
    const c = (await repo.getClient(id))!;
    expect(c.expiresAt.toISOString()).toBe("2027-01-31T18:29:59.000Z");
    expect(membershipStatus(c, now)).toBe("active");
    const rows = await adminRows(repo, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor).toBe("admin");
  });
  it.each(["2026-02-31", "garbage", "2026-1-5", "2026-13-01", ""])(
    "rejects invalid date %j",
    async (d) => {
      const repo = createMemoryRepo();
      await expect(
        createClientAccount(repo, { ...input, expiresOn: d }, now),
      ).rejects.toThrow("valid date");
      expect(await repo.listClients()).toHaveLength(0);
    },
  );
  it("rejects blank name and bad pc limit", async () => {
    const repo = createMemoryRepo();
    await expect(
      createClientAccount(repo, { ...input, name: " " }, now),
    ).rejects.toThrow();
    await expect(
      createClientAccount(repo, { ...input, pcLimit: 0 }, now),
    ).rejects.toThrow();
  });
});

describe("updateClientDetails / setPcLimit / setExpiryDate", () => {
  it("updates details and audits", async () => {
    const { repo, id } = await setup();
    await updateClientDetails(repo, id, { name: "New" });
    const c = (await repo.getClient(id))!;
    expect(c.name).toBe("New");
    expect(await adminRows(repo, id)).toHaveLength(2);
  });
  it("sets pc limit within 1-100 only", async () => {
    const { repo, id } = await setup();
    await setPcLimit(repo, id, 100);
    expect((await repo.getClient(id))!.pcLimit).toBe(100);
    await expect(setPcLimit(repo, id, 101)).rejects.toThrow();
    await expect(setPcLimit(repo, id, 0)).rejects.toThrow();
    await expect(setPcLimit(repo, id, 1.5)).rejects.toThrow();
  });
  it("sets expiry and rejects invalid dates", async () => {
    const { repo, id } = await setup();
    await setExpiryDate(repo, id, "2026-12-01");
    expect((await repo.getClient(id))!.expiresAt.toISOString()).toBe(
      "2026-12-01T18:29:59.000Z",
    );
    await expect(setExpiryDate(repo, id, "2026-02-31")).rejects.toThrow(
      "valid date",
    );
    await expect(setExpiryDate(repo, id, "garbage")).rejects.toThrow(
      "valid date",
    );
  });
});

describe("extendMembership", () => {
  it("extends an expired client one month from today 23:59:59 IST", async () => {
    const { repo, id } = await setup();
    await setExpiryDate(repo, id, "2026-11-02");
    const before = (await adminRows(repo, id)).length;
    const result = await extendMembership(repo, id, 1, now);
    expect(result.toISOString()).toBe("2026-12-09T18:29:59.000Z");
    expect((await repo.getClient(id))!.expiresAt).toEqual(result);
    expect((await adminRows(repo, id)).length).toBe(before + 1);
  });
});

describe("setCredentials", () => {
  it("stores a login that findLogin resolves", async () => {
    const { repo, id } = await setup();
    await setCredentials(repo, id, "acme.user", "longenough");
    const login = await repo.findLogin("acme.user");
    expect(login?.clientId).toBe(id);
    expect(login?.passwordHash).not.toContain("longenough");
  });
  it("rejects duplicate usernames", async () => {
    const { repo, id } = await setup();
    const other = await createClientAccount(repo, input, now);
    await setCredentials(repo, id, "acme.user", "longenough");
    await expect(
      setCredentials(repo, other, "ACME.user", "longenough"),
    ).rejects.toThrow("Username already in use");
  });
  it("validates username shape and password length", async () => {
    const { repo, id } = await setup();
    await expect(
      setCredentials(repo, id, "a b", "longenough"),
    ).rejects.toThrow();
    await expect(
      setCredentials(repo, id, "ab", "longenough"),
    ).rejects.toThrow();
    await expect(
      setCredentials(repo, id, "good.name", "short"),
    ).rejects.toThrow();
  });
  it("does not audit the password", async () => {
    const { repo, id } = await setup();
    await setCredentials(repo, id, "acme.user", "longenough");
    expect(JSON.stringify(await adminRows(repo, id))).not.toContain(
      "longenough",
    );
  });
});

describe("issueLoginCode", () => {
  it("returns 6 digits, stores only the HMAC, expires in 48h", async () => {
    const { repo, id } = await setup();
    const r = await issueLoginCode(repo, env, id, now);
    expect(r.code).toMatch(/^\d{6}$/);
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 48 * 3_600_000);
    expect(r.whatsappText).toContain(
      `${r.code.slice(0, 3)} ${r.code.slice(3)}`,
    );
    const [stored] = [...repo.codes.values()];
    expect(stored!.codeHmac).not.toBe(r.code);
    expect(stored!.codeHmac).toBe(hashLoginCode(r.code, env.sessionSecret));
    expect(JSON.stringify(await adminRows(repo, id))).not.toContain(r.code);
  });
  it("formats the WhatsApp text exactly, in IST", async () => {
    const { repo, id } = await setup();
    const r = await issueLoginCode(repo, env, id, now);
    // 2026-11-09T06:00Z + 48h = 2026-11-11T06:00Z = 11:30 am IST
    const spaced = `${r.code.slice(0, 3)} ${r.code.slice(3)}`;
    expect(r.whatsappText).toBe(
      [
        "Hello Ravi 👋",
        "",
        "Welcome to *Bakvion* — automatic, encrypted backups for *Acme*. 🛡️",
        "",
        `🔐 Your sign-in code: *${spaced}*`,
        "🕒 Valid until: 11 Nov 2026, 11:30 AM (IST)",
        "✅ One-time use — please keep it private.",
        "",
        "*How to sign in*",
        "1️⃣ Open the Bakvion app on your PC",
        "2️⃣ Choose *Sign in → 6-digit code*",
        "3️⃣ Enter the code above",
        "",
        "Need help? Just reply to this message. 🙂",
        "— Team Bakvion",
      ].join("\n"),
    );
  });
  it("formatIST output shape", () => {
    expect(formatIST(new Date("2026-11-12T09:35:00Z"))).toBe(
      "12 Nov 2026, 3:05 pm",
    );
    expect(formatIST(new Date("2026-11-12T18:30:00Z"))).toBe(
      "13 Nov 2026, 12:00 am",
    );
  });
  it("retries on collision then throws after 5 attempts", async () => {
    const { repo, id } = await setup();
    let calls = 0;
    const real = repo.createLoginCode.bind(repo);
    repo.createLoginCode = async (...a) => {
      calls++;
      return calls < 3 ? false : real(...a);
    };
    await issueLoginCode(repo, env, id, now);
    expect(calls).toBe(3);
    calls = 0;
    repo.createLoginCode = async () => {
      calls++;
      return false;
    };
    await expect(issueLoginCode(repo, env, id, now)).rejects.toThrow();
    expect(calls).toBe(5);
  });
});

describe("block / devices / delete / settings", () => {
  it("blocks and unblocks", async () => {
    const { repo, id } = await setup();
    await setBlocked(repo, id, true);
    expect((await repo.getClient(id))!.blocked).toBe(true);
    await setBlocked(repo, id, false);
    expect((await repo.getClient(id))!.blocked).toBe(false);
  });
  it("removing a device invalidates its token", async () => {
    const { repo, id } = await setup();
    const r = await repo.registerDevice(
      id,
      {
        installId: "i1",
        machineName: "PC",
        windowsVersion: "11",
        appVersion: "1",
      },
      "tokhash",
      now,
    );
    if (r.outcome !== "ok") throw new Error("register failed");
    expect(await repo.deviceByToken("tokhash")).not.toBeNull();
    await removeClientDevice(repo, r.deviceId, now, id);
    expect(await repo.deviceByToken("tokhash")).toBeNull();
    const rows = await adminRows(repo, id);
    expect(
      rows.some((x) => x.action === "device_removed" && x.actor === "admin"),
    ).toBe(true);
  });
  it("sets renew contact with a 500 char cap", async () => {
    const repo = createMemoryRepo();
    await setRenewContact(repo, "  Call 99999  ");
    expect(await repo.getSetting("renew_contact")).toBe("Call 99999");
    await expect(setRenewContact(repo, "x".repeat(501))).rejects.toThrow();
    await setRenewContact(repo, "x".repeat(500));
  });
});

describe("filterClients", () => {
  const base: ClientRecord = {
    id: "",
    name: "",
    contactPerson: "",
    phone: "",
    notes: "",
    expiresAt: now,
    pcLimit: 1,
    blocked: false,
    createdAt: now,
  };
  const day = 86_400_000;
  const mk = (id: string, over: Partial<ClientSummary>): ClientSummary => ({
    ...base,
    id,
    name: id,
    username: null,
    pcsUsed: 0,
    lastSeenAt: null,
    ...over,
  });
  const list = [
    mk("active", { expiresAt: new Date(now.getTime() + 30 * day) }),
    mk("soon", {
      expiresAt: new Date(now.getTime() + 5 * day),
      phone: "12345",
    }),
    mk("edge", { expiresAt: new Date(now.getTime() + 10 * day) }),
    mk("gone", { expiresAt: new Date(now.getTime() - day) }),
    mk("blk", { expiresAt: new Date(now.getTime() + 30 * day), blocked: true }),
    mk("tst", {
      expiresAt: new Date(now.getTime() + 30 * day),
      username: "Zed",
    }),
  ];
  const ids = (l: ClientSummary[]) => l.map((c) => c.id);
  it("expiring = within 10 days and not expired", () => {
    expect(ids(filterClients(list, "", "expiring", now))).toEqual([
      "soon",
      "edge",
    ]);
  });
  it("expired / blocked / all", () => {
    expect(ids(filterClients(list, "", "expired", now))).toEqual(["gone"]);
    expect(ids(filterClients(list, "", "blocked", now))).toEqual(["blk"]);
    expect(filterClients(list, "", "all", now)).toHaveLength(6);
  });
  it("searches name, phone and username case-insensitively", () => {
    expect(ids(filterClients(list, "SOO", "all", now))).toEqual(["soon"]);
    expect(ids(filterClients(list, "1234", "all", now))).toEqual(["soon"]);
    expect(ids(filterClients(list, "zed", "all", now))).toEqual(["tst"]);
  });
});

describe("AdminInputError", () => {
  it("is thrown for every validation path", async () => {
    const { repo, id } = await setup();
    const checks: Promise<unknown>[] = [
      createClientAccount(repo, { ...input, expiresOn: "garbage" }, now),
      createClientAccount(repo, { ...input, name: " " }, now),
      createClientAccount(repo, { ...input, pcLimit: 0 }, now),
      setExpiryDate(repo, id, "2026-02-31"),
      setPcLimit(repo, id, 101),
      extendMembership(repo, id, 2 as 1, now),
      setCredentials(repo, id, "a b", "longenough"),
      setCredentials(repo, id, "good.name", "short"),
      setRenewContact(repo, "x".repeat(501)),
      setBlocked(repo, "not-a-uuid", true),
      setBlocked(repo, "00000000-0000-4000-8000-000000000000", true),
      removeClientDevice(repo, "nope", now, id),
    ];
    for (const c of checks)
      await expect(c).rejects.toBeInstanceOf(AdminInputError);
    await setCredentials(repo, id, "acme.user", "longenough");
    const other = await createClientAccount(repo, input, now);
    await expect(
      setCredentials(repo, other, "acme.user", "longenough"),
    ).rejects.toBeInstanceOf(AdminInputError);
  });
  it("publicErrorMessage hides non-AdminInputError text", () => {
    expect(publicErrorMessage(new AdminInputError("Client not found"))).toBe(
      "Client not found",
    );
    expect(
      publicErrorMessage(new Error('invalid input syntax for type uuid: "x"')),
    ).toBe(GENERIC_ERROR);
    expect(publicErrorMessage("boom")).toBe(GENERIC_ERROR);
  });
  it("a repo failure surfaces as a generic error, not input error", async () => {
    const { repo, id } = await setup();
    repo.updateClient = async () => {
      throw new Error("violates constraint clients_pc_limit_check");
    };
    const err = await setPcLimit(repo, id, 5).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(AdminInputError);
    expect(publicErrorMessage(err)).toBe(GENERIC_ERROR);
  });
  it("removeClientDevice refuses a device of another client", async () => {
    const { repo, id } = await setup();
    const other = await createClientAccount(repo, input, now);
    const r = await repo.registerDevice(
      other,
      {
        installId: "i9",
        machineName: "PC",
        windowsVersion: "11",
        appVersion: "1",
      },
      "tok9",
      now,
    );
    if (r.outcome !== "ok") throw new Error("register failed");
    await expect(
      removeClientDevice(repo, r.deviceId, now, id),
    ).rejects.toBeInstanceOf(AdminInputError);
    expect(await repo.deviceByToken("tok9")).not.toBeNull();
  });
});
