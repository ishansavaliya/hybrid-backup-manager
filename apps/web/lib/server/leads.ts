import type { Mailer } from "./mailer";
import { AdminInputError } from "./admin-service";
import type { LeadInput, Repo } from "./repo";

export const LEAD_WINDOW_SECONDS = 3600;
export const LEAD_LIMITS = { ip: 5, install: 3, global: 200 } as const;

export type LeadErrors = Partial<
  Record<"name" | "business" | "phone" | "email" | "pcs" | "message", string>
>;

export type LeadValidation =
  | { ok: true; lead: Omit<LeadInput, "ip">; spam: boolean }
  | { ok: false; errors: LeadErrors };

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Validates an enquiry. `website` is a hidden honeypot field bots fill in. */
export function validateLead(body: unknown): LeadValidation {
  const b = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const errors: LeadErrors = {};
  const name = text(b.name);
  const business = text(b.business);
  const phone = text(b.phone);
  const email = text(b.email);
  const city = text(b.city).slice(0, 80);
  const message = text(b.message);
  const digits = phone.replace(/[\s+\-()]/g, "");
  if (name.length < 2 || name.length > 120) errors.name = "Enter your name.";
  if (business.length < 2 || business.length > 120)
    errors.business = "Enter your business name.";
  if (!/^\d{10,15}$/.test(digits))
    errors.phone = "Enter a valid phone number (10 to 15 digits).";
  if (
    email &&
    (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    errors.email = "Enter a valid email or leave it empty.";
  let pcs: number | null = null;
  if (b.pcs !== undefined && b.pcs !== null && b.pcs !== "") {
    const n = Number(b.pcs);
    if (!Number.isInteger(n) || n < 1 || n > 100)
      errors.pcs = "Number of PCs must be between 1 and 100.";
    else pcs = n;
  }
  if (message.length > 1000)
    errors.message = "Keep the message under 1000 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const installId = text(b.installId);
  return {
    ok: true,
    spam: text(b.website) !== "",
    lead: {
      source: b.source === "app" ? "app" : "website",
      name,
      business,
      phone,
      email,
      city,
      pcs,
      message,
      installId: /^[a-f0-9]{32}$/.test(installId) ? installId : "",
      appVersion: text(b.appVersion).slice(0, 32),
    },
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Owner notification for a new enquiry. */
export function leadEmail(
  l: LeadInput,
  at: Date,
  adminUrl?: string,
): { subject: string; text: string; html: string } {
  const rows: [string, string][] = [
    ["Name", l.name],
    ["Business", l.business],
    ["Phone", l.phone],
    ["Email", l.email || "—"],
    ["City", l.city || "—"],
    ["PCs", l.pcs ? String(l.pcs) : "—"],
    ["Message", l.message || "—"],
    ["From", l.source === "app" ? "Bakvion app" : "Website"],
    ["Received", `${IST.format(at)} IST`],
    ["IP", l.ip || "—"],
  ];
  const link = adminUrl ? `${adminUrl.replace(/\/$/, "")}/bkpadmin/leads` : "";
  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    (link ? `\n\nOpen Leads: ${link}` : "") +
    "\n\nPlease contact them within 24 hours.";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171a">
<h2 style="margin:0 0 12px">New Bakvion enquiry</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="color:#6c717a;vertical-align:top">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`,
    )
    .join("")}</table>
${link ? `<p><a href="${esc(link)}">Open Leads in the admin panel</a></p>` : ""}
<p style="color:#6c717a">Please contact them within 24 hours.</p></div>`;
  return { subject: `New Bakvion enquiry — ${l.business}`, text, html };
}

export interface LeadDeps {
  repo: Repo;
  mailer: Mailer | null;
  notifyTo: string | null;
  adminUrl?: string;
}

export type LeadResult = { status: number; body: unknown };

/** Saves an enquiry, then emails the owner. Email failure never loses the lead. */
export async function submitLead(
  deps: LeadDeps,
  body: unknown,
  ctx: { ip: string; now: Date },
): Promise<LeadResult> {
  const v = validateLead(body);
  if (!v.ok)
    return {
      status: 400,
      body: {
        error: { code: "bad_request", message: "Please check the form." },
        fields: v.errors,
      },
    };
  const { repo } = deps;
  const keys = [
    { key: `lead:ip:${ctx.ip}`, max: LEAD_LIMITS.ip },
    ...(v.lead.installId
      ? [{ key: `lead:install:${v.lead.installId}`, max: LEAD_LIMITS.install }]
      : []),
    { key: "lead:global", max: LEAD_LIMITS.global },
  ];
  for (const k of keys) {
    if (await repo.rateLimited(k.key, k.max, LEAD_WINDOW_SECONDS, ctx.now))
      return {
        status: 429,
        body: {
          error: {
            code: "rate_limited",
            message: "Too many requests. Please try again later.",
          },
        },
      };
  }
  for (const k of keys)
    await repo.recordFailure(k.key, LEAD_WINDOW_SECONDS, ctx.now);
  // Bots get the same success response but nothing is stored or sent.
  if (v.spam) return { status: 200, body: { ok: true } };

  const lead: LeadInput = { ...v.lead, ip: ctx.ip };
  const id = await repo.createLead(lead, ctx.now);
  await repo.audit({
    actor: "system",
    action: "lead_received",
    details: { business: lead.business, source: lead.source },
    ip: ctx.ip,
  });
  if (deps.mailer && deps.notifyTo) {
    try {
      const mail = leadEmail(lead, ctx.now, deps.adminUrl);
      await deps.mailer.send({
        to: deps.notifyTo,
        ...mail,
        replyTo: lead.email || undefined,
      });
      await repo.markLeadEmailSent(id);
    } catch (err) {
      console.error(
        "lead email failed:",
        err instanceof Error ? err.message : typeof err,
      );
    }
  }
  return { status: 200, body: { ok: true } };
}

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "converted",
  "not_interested",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin: move a lead along (new → contacted → converted / not interested). */
export async function changeLeadStatus(
  repo: Repo,
  id: string,
  status: string,
): Promise<void> {
  if (!UUID.test(id)) throw new AdminInputError("Lead not found");
  if (!(LEAD_STATUSES as readonly string[]).includes(status))
    throw new AdminInputError("Unknown lead status");
  const lead = await repo.getLead(id);
  if (!lead) throw new AdminInputError("Lead not found");
  await repo.setLeadStatus(id, status as (typeof LEAD_STATUSES)[number]);
  await repo.audit({
    actor: "admin",
    action: "lead_status_set",
    details: { business: lead.business, status },
  });
}

/** Admin: a client was created from this lead. */
export async function convertLead(
  repo: Repo,
  leadId: string,
  clientId: string,
): Promise<void> {
  if (!UUID.test(leadId)) return;
  if (!(await repo.getLead(leadId))) return;
  await repo.setLeadStatus(leadId, "converted", clientId);
}
