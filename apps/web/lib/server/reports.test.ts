import { beforeEach, describe, expect, it } from "vitest";
import type { MailMessage, Mailer } from "./mailer";
import type { ClientRecord } from "./repo";
import {
  explain,
  parseSettings,
  readNotes,
  REPORT_LIMITS,
  routeReport,
  runReportDigest,
  singleReportEmail,
  submitReports,
  summaryReportEmail,
  testReportEmail,
} from "./reports";
import { createMemoryRepo } from "./testing/memory-repo";
import { generateDeviceToken, hashToken } from "./tokens";

const now = new Date("2026-11-10T08:00:00.000Z");
const client: ClientRecord = {
  id: "c1",
  name: "Mehta Traders",
  contactPerson: "",
  phone: "",
  notes: "",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  pcLimit: 2,
  blocked: false,
  createdAt: now,
};

let repo: ReturnType<typeof createMemoryRepo>;
let sent: MailMessage[];
let mailer: Mailer;
let token: string;

beforeEach(async () => {
  repo = createMemoryRepo({ clients: [client] });
  await repo.setSetting("renew_contact", "help@bakvion.in");
  sent = [];
  mailer = {
    async send(m) {
      sent.push(m);
    },
  };
  token = generateDeviceToken();
  await repo.registerDevice(
    "c1",
    {
      installId: "a".repeat(32),
      machineName: "ACCOUNTS-PC",
      windowsVersion: "Windows 11",
      appVersion: "0.2.0",
    },
    hashToken(token),
    now,
  );
});

const settings = (over: Partial<{ emails: string[]; mode: string }> = {}) => ({
  emails: ["owner@mehta.in"],
  mode: "all",
  ...over,
});
let seq = 0;
const run = (over: Record<string, unknown> = {}) => ({
  runId: `run-${++seq}`,
  planName: "Accounts (Tally)",
  destinationName: "Office SSD",
  scheduleKind: "daily",
  state: "succeeded",
  startedAt: "2026-11-10T07:30:00Z",
  finishedAt: "2026-11-10T07:31:25Z",
  error: "",
  notes: "",
  ...over,
});
const submit = (body: unknown, m: Mailer | null = mailer, t = token) =>
  submitReports({ repo, mailer: m }, t, body, { now });

describe("settings", () => {
  it("accepts up to three valid addresses, deduped", () => {
    expect(
      parseSettings({ emails: [" a@b.in", "A@b.in", "c@d.in"], mode: "all" }),
    ).toEqual({ emails: ["a@b.in", "c@d.in"], mode: "all" });
    expect(parseSettings({ emails: ["x"], mode: "all" })).toBeNull();
    expect(parseSettings({ emails: [], mode: "daily" })).toBeNull();
    expect(
      parseSettings({
        emails: ["a@b.in", "c@d.in", "e@f.in", "g@h.in"],
        mode: "all",
      }),
    ).toBeNull();
  });

  it("routes by mode, state and schedule", () => {
    const s = { emails: ["a@b.in"], mode: "all" as const };
    const ok = { state: "succeeded" as const, scheduleKind: "daily" as const };
    const bad = { state: "failed" as const, scheduleKind: "hourly" as const };
    expect(routeReport(ok, s)).toBe("now");
    expect(routeReport({ ...ok, scheduleKind: "hourly" }, s)).toBe("digest");
    expect(routeReport(bad, s)).toBe("now");
    expect(routeReport(ok, { ...s, mode: "failures" })).toBe("skip");
    expect(routeReport(bad, { ...s, mode: "failures" })).toBe("now");
    expect(routeReport(bad, { ...s, mode: "off" })).toBe("skip");
    expect(routeReport(bad, { ...s, emails: [] })).toBe("skip");
  });
});

describe("submitReports", () => {
  it("rejects bad tokens and malformed batches", async () => {
    expect(
      (await submit({ settings: settings(), reports: [] }, mailer, "x")).status,
    ).toBe(401);
    expect(
      (
        await submit(
          { settings: settings(), reports: [] },
          mailer,
          generateDeviceToken(),
        )
      ).status,
    ).toBe(401);
    expect((await submit({ reports: [] })).status).toBe(400);
    expect(
      (await submit({ settings: settings({ mode: "x" }), reports: [] })).status,
    ).toBe(400);
    const tooMany = Array.from({ length: REPORT_LIMITS.batch + 1 }, () =>
      run(),
    );
    expect(
      (await submit({ settings: settings(), reports: tooMany })).status,
    ).toBe(400);
  });

  it("saves settings, emails a failure at once and never twice", async () => {
    const failed = run({
      state: "failed",
      error: "repository does not exist: E:\\BakvionRepository",
    });
    const r = await submit({ settings: settings(), reports: [failed] });
    expect(r).toEqual({ status: 200, body: { ok: true, received: 1 } });
    expect(repo.devices[0]!.reportEmails).toEqual(["owner@mehta.in"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("owner@mehta.in");
    expect(sent[0]!.replyTo).toBe("help@bakvion.in");
    expect(sent[0]!.subject).toBe(
      "❌ Backup failed · Accounts (Tally) · Mehta Traders",
    );
    expect(sent[0]!.html).toContain(
      "The backup disk or folder could not be reached.",
    );
    expect(sent[0]!.text).toContain("ACCOUNTS-PC");
    expect(repo.reports[0]!.emailStatus).toBe("sent");
    // The PC retries the same run (e.g. response lost): stored once, no new email.
    expect(
      (await submit({ settings: settings(), reports: [failed] })).body,
    ).toEqual({ ok: true, received: 0 });
    expect(sent).toHaveLength(1);
  });

  it("drops malformed runs without blocking the rest", async () => {
    const r = await submit({
      settings: settings(),
      reports: [
        run({ runId: "../x" }),
        run({ state: "weird" }),
        run({ startedAt: "nope" }),
        run(),
      ],
    });
    expect(r.body).toEqual({ ok: true, received: 1 });
  });

  it("holds hourly successes for the daily summary and skips per mode", async () => {
    await submit({
      settings: settings(),
      reports: [
        run({ scheduleKind: "hourly" }),
        run({ scheduleKind: "hourly" }),
      ],
    });
    expect(sent).toHaveLength(0);
    expect(repo.reports.map((r) => r.emailStatus)).toEqual([
      "digest",
      "digest",
    ]);
    await submit({
      settings: settings({ mode: "failures" }),
      reports: [run()],
    });
    expect(sent).toHaveLength(0);
    expect(repo.reports[2]!.emailStatus).toBe("skipped");
  });

  it("sends many runs at once as one summary", async () => {
    const reports = [
      run(),
      run(),
      run({ state: "failed", error: "no space left on device" }),
      run(),
      run({ state: "interrupted" }),
    ];
    await submit({
      settings: settings({ emails: ["a@b.in", "c@d.in"] }),
      reports,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("a@b.in, c@d.in");
    expect(sent[0]!.subject).toBe("❌ 1 of 5 backups failed · Mehta Traders");
    expect(sent[0]!.html).toContain("The backup disk is full.");
    expect(repo.reports.every((r) => r.emailStatus === "sent")).toBe(true);
  });

  it("caps emails per PC per day", async () => {
    for (let i = 0; i < REPORT_LIMITS.emails + 2; i++)
      await submit({
        settings: settings(),
        reports: [run({ state: "failed" })],
      });
    expect(sent).toHaveLength(REPORT_LIMITS.emails);
    expect(repo.reports.at(-1)!.emailStatus).toBe("skipped");
  });

  it("keeps runs pending when email is not configured", async () => {
    await submit(
      { settings: settings(), reports: [run({ state: "failed" })] },
      null,
    );
    expect(repo.reports[0]!.emailStatus).toBe("pending");
  });

  it("sends a test email on request", async () => {
    const r = await submit({
      settings: settings({ mode: "failures" }),
      reports: [],
      test: true,
    });
    expect(r.status).toBe(200);
    expect(sent[0]!.subject).toBe(
      "✉️ Bakvion email reports are on · Mehta Traders",
    );
    expect(sent[0]!.html).toContain("only when a backup fails");
    expect(
      (
        await submit({
          settings: settings({ emails: [] }),
          reports: [],
          test: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (await submit({ settings: settings(), reports: [], test: true }, null))
        .status,
    ).toBe(503);
    for (let i = 0; i < REPORT_LIMITS.tests; i++)
      await submit({ settings: settings(), reports: [], test: true });
    expect(
      (await submit({ settings: settings(), reports: [], test: true })).status,
    ).toBe(429);
  });
});

describe("runReportDigest", () => {
  it("sends one summary per PC and respects changed settings", async () => {
    await submit({
      settings: settings(),
      reports: [
        run({ scheduleKind: "hourly" }),
        run({ scheduleKind: "hourly" }),
        run({ scheduleKind: "hourly" }),
      ],
    });
    expect(await runReportDigest({ repo, mailer }, now)).toEqual({
      digests: 1,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe(
      "✅ Daily backup summary · 3 completed · Mehta Traders",
    );
    expect(repo.reports.every((r) => r.emailStatus === "sent")).toBe(true);
    expect(await runReportDigest({ repo, mailer }, now)).toEqual({
      digests: 0,
    });

    await submit({
      settings: settings(),
      reports: [run({ scheduleKind: "hourly" })],
    });
    await repo.setReportSettings(
      repo.devices[0]!.id,
      ["owner@mehta.in"],
      "failures",
    );
    expect(await runReportDigest({ repo, mailer }, now)).toEqual({
      digests: 0,
    });
    expect(repo.reports.at(-1)!.emailStatus).toBe("skipped");
  });
});

describe("email content", () => {
  const ctx = {
    client: { name: "Mehta <Traders>" },
    device: { machineName: "ACCOUNTS-PC" },
    settings: { emails: ["owner@mehta.in"], mode: "all" as const },
    contact: "",
    now,
  };
  const input = {
    runId: "r",
    planName: "Accounts",
    destinationName: "SSD",
    scheduleKind: "daily" as const,
    state: "succeeded" as const,
    startedAt: new Date("2026-11-10T07:30:00Z"),
    finishedAt: new Date("2026-11-10T07:31:25Z"),
    error: "",
    notes: "Old versions cleaned up",
  };

  it("escapes names and shows details in IST", () => {
    const m = singleReportEmail(input, ctx);
    expect(m.subject).toBe("✅ Backup completed · Accounts · Mehta <Traders>");
    expect(m.html).toContain("Mehta &lt;Traders&gt;");
    expect(m.html).not.toContain("Mehta <Traders>");
    expect(m.html).toContain("1 min 25 sec");
    expect(m.html).toMatch(/1:00 [pP][mM] IST/);
    expect(m.text).toContain("Cleanup: Old versions cleaned up");
  });

  it("gives plain-language causes", () => {
    expect(explain({ state: "interrupted", error: "" }).reason).toMatch(
      /stopped before it finished/,
    );
    expect(
      explain({
        state: "failed",
        error: "this destination is not set up yet; click Set up first",
      }).reason,
    ).toBe("This backup destination is not set up yet.");
    expect(
      explain({
        state: "failed",
        error: "Fatal: wrong password or no key found",
      }).reason,
    ).toMatch(/encryption key/);
    expect(explain({ state: "failed", error: "something odd" }).reason).toBe(
      "The backup could not finish.",
    );
  });

  it("summaries list the newest runs first and count states", () => {
    const m = summaryReportEmail(
      [
        input,
        {
          ...input,
          runId: "b",
          state: "failed",
          finishedAt: new Date("2026-11-10T09:00:00Z"),
        },
      ],
      ctx,
      "batch",
    );
    expect(m.text.split("\n")[0]).toBe("1 of 2 backups failed");
    expect(m.text).toContain("Completed: 1   Failed: 1   Interrupted: 0");
    expect(m.text.indexOf("✕")).toBeLessThan(m.text.indexOf("✓"));
  });

  it("test email names the addresses", () => {
    expect(testReportEmail(ctx).text).toContain("Sent to: owner@mehta.in");
  });
});

describe("run notes", () => {
  const ctx = {
    client: { name: "Mehta Traders" },
    device: { machineName: "ACCOUNTS-PC" },
    settings: { emails: ["owner@mehta.in"], mode: "all" as const },
    contact: "",
    now,
  };
  const ok = {
    runId: "r",
    planName: "Accounts",
    destinationName: "SSD",
    scheduleKind: "daily" as const,
    state: "succeeded" as const,
    startedAt: new Date("2026-11-10T07:30:00Z"),
    finishedAt: new Date("2026-11-10T07:31:00Z"),
    error: "",
    notes: "",
  };

  it("reads cleanup, warnings and info lines", () => {
    const n = readNotes(
      [
        "Backup disk found at F:\\ (was E:\\)",
        "Some files could not be read and were skipped",
        "Cleanup skipped: some files could not be read",
        "Backup disk is 93% full (4.2 GB free)",
      ].join("\n"),
    );
    expect(n.cleanup).toBe("Skipped this time (backup is safe)");
    expect(n.warnings).toHaveLength(2);
    expect(n.warnings[1]).toContain("93% full (4.2 GB free)");
    expect(n.info[0]).toContain("found at F:\\");
  });

  it("a success with warnings is not reported as all clear", () => {
    const m = singleReportEmail(
      { ...ok, notes: "Backup disk is 95% full (1.0 GB free)" },
      ctx,
    );
    expect(m.subject).toBe(
      "⚠️ Backup completed with warnings · Accounts · Mehta Traders",
    );
    expect(m.html).toContain("Please note");
    expect(m.html).not.toContain("No action needed");
    const clean = singleReportEmail(
      { ...ok, notes: "Backup disk found at F:\\ (was E:\\)" },
      ctx,
    );
    expect(clean.subject.startsWith("✅ Backup completed ·")).toBe(true);
    expect(clean.html).toContain("Good to know");
  });
});
