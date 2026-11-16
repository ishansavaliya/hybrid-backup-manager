import { describe, expect, it } from "vitest";
import { leadEmail, submitLead, validateLead } from "./leads";
import type { MailMessage } from "./mailer";
import { createMemoryRepo } from "./testing/memory-repo";

const NOW = new Date("2026-11-10T10:00:00Z");
const good = {
  name: "Asha Mehta",
  business: "Mehta Traders",
  phone: "+91 98765 43210",
  email: "asha@example.com",
  city: "Ahmedabad",
  pcs: 2,
  message: "Need backup for Tally PCs",
  source: "app",
  installId: "a".repeat(32),
};

function deps(fail = false) {
  const sent: MailMessage[] = [];
  const repo = createMemoryRepo();
  return {
    sent,
    repo,
    d: {
      repo,
      notifyTo: "owner@example.com",
      mailer: {
        async send(m: MailMessage) {
          if (fail) throw new Error("smtp down");
          sent.push(m);
        },
      },
    },
  };
}

describe("validateLead", () => {
  it("accepts a complete enquiry and normalises fields", () => {
    const v = validateLead(good);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.lead.source).toBe("app");
      expect(v.lead.pcs).toBe(2);
      expect(v.spam).toBe(false);
    }
  });
  it("requires name, business and a 10-15 digit phone", () => {
    const v = validateLead({ name: "A", business: "", phone: "12345" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(Object.keys(v.errors).sort()).toEqual([
        "business",
        "name",
        "phone",
      ]);
    }
  });
  it("rejects bad email and PC counts, allows empty optionals", () => {
    expect(validateLead({ ...good, email: "nope" }).ok).toBe(false);
    expect(validateLead({ ...good, pcs: 0 }).ok).toBe(false);
    expect(validateLead({ ...good, pcs: 101 }).ok).toBe(false);
    const v = validateLead({ ...good, email: "", pcs: "", city: "" });
    expect(v.ok).toBe(true);
  });
  it("flags the honeypot and drops a malformed install id", () => {
    const v = validateLead({ ...good, website: "http://spam", installId: "x" });
    expect(v.ok && v.spam).toBe(true);
    expect(v.ok && v.lead.installId).toBe("");
  });
});

describe("submitLead", () => {
  it("saves, emails the owner and marks email sent", async () => {
    const { d, sent, repo } = deps();
    const r = await submitLead(d, good, { ip: "1.2.3.4", now: NOW });
    expect(r.status).toBe(200);
    const [lead] = await repo.listLeads(10);
    expect(lead).toMatchObject({
      business: "Mehta Traders",
      status: "new",
      emailSent: true,
      ip: "1.2.3.4",
    });
    expect(sent[0]!.to).toBe("owner@example.com");
    expect(sent[0]!.subject).toBe("New Bakvion enquiry — Mehta Traders");
    expect(sent[0]!.replyTo).toBe("asha@example.com");
    expect(await repo.countNewLeads()).toBe(1);
  });
  it("keeps the lead when email fails", async () => {
    const { d, repo } = deps(true);
    const r = await submitLead(d, good, { ip: "1.2.3.4", now: NOW });
    expect(r.status).toBe(200);
    expect((await repo.listLeads(10))[0]!.emailSent).toBe(false);
  });
  it("returns field errors without saving", async () => {
    const { d, repo } = deps();
    const r = await submitLead(d, { name: "x" }, { ip: "1.2.3.4", now: NOW });
    expect(r.status).toBe(400);
    expect(await repo.listLeads(10)).toHaveLength(0);
  });
  it("silently discards honeypot submissions", async () => {
    const { d, repo, sent } = deps();
    const r = await submitLead(
      d,
      { ...good, website: "x" },
      { ip: "1.2.3.4", now: NOW },
    );
    expect(r.status).toBe(200);
    expect(await repo.listLeads(10)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
  it("limits 3 per install id and 5 per IP per hour", async () => {
    const { d } = deps();
    for (let i = 0; i < 3; i++)
      expect(
        (await submitLead(d, good, { ip: `9.9.9.${i}`, now: NOW })).status,
      ).toBe(200);
    expect(
      (await submitLead(d, good, { ip: "9.9.9.9", now: NOW })).status,
    ).toBe(429);
    const web = { ...good, installId: "" };
    for (let i = 0; i < 5; i++)
      expect(
        (await submitLead(d, web, { ip: "5.5.5.5", now: NOW })).status,
      ).toBe(200);
    expect((await submitLead(d, web, { ip: "5.5.5.5", now: NOW })).status).toBe(
      429,
    );
    const later = new Date(NOW.getTime() + 3601_000);
    expect(
      (await submitLead(d, web, { ip: "5.5.5.5", now: later })).status,
    ).toBe(200);
  });
});

describe("leadEmail", () => {
  it("escapes HTML and lists every field", () => {
    const v = validateLead(good);
    if (!v.ok) throw new Error("fixture should be valid");
    const m = leadEmail(
      { ...v.lead, business: "<b>Evil</b>", ip: "1.2.3.4" },
      NOW,
      "https://bakvion.vercel.app/",
    );
    expect(m.html).not.toContain("<b>Evil</b>");
    expect(m.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(m.text).toContain("Phone: +91 98765 43210");
    expect(m.text).toContain("https://bakvion.vercel.app/bkpadmin/leads");
  });
});

describe("lead admin", () => {
  it("changes status with audit and rejects unknown values", async () => {
    const { d, repo } = deps();
    await submitLead(d, good, { ip: "1.1.1.1", now: NOW });
    const [lead] = await repo.listLeads(1);
    const { changeLeadStatus } = await import("./leads");
    await changeLeadStatus(repo, lead!.id, "contacted");
    expect((await repo.getLead(lead!.id))!.status).toBe("contacted");
    await expect(changeLeadStatus(repo, lead!.id, "won")).rejects.toThrow();
    await expect(changeLeadStatus(repo, "nope", "new")).rejects.toThrow();
    const audit = await repo.listAudit({ limit: 10 });
    expect(audit.some((a) => a.action === "lead_status_set")).toBe(true);
  });
  it("converting links the client and ignores bad ids", async () => {
    const { d, repo } = deps();
    await submitLead(d, good, { ip: "1.1.1.1", now: NOW });
    const [lead] = await repo.listLeads(1);
    const { convertLead } = await import("./leads");
    await convertLead(repo, "not-a-uuid", "c1");
    await convertLead(repo, lead!.id, "11111111-1111-4111-8111-111111111111");
    expect(await repo.getLead(lead!.id)).toMatchObject({
      status: "converted",
      clientId: "11111111-1111-4111-8111-111111111111",
    });
  });
});
