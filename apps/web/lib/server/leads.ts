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

/** wa.me needs digits with country code; 10-digit numbers are Indian. */
export function whatsappDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

/** Owner notification for a new enquiry (email-client-safe HTML + text). */
export function leadEmail(
  l: LeadInput,
  at: Date,
  adminUrl?: string,
): { subject: string; text: string; html: string } {
  const when = `${IST.format(at)} IST`;
  const source = l.source === "app" ? "Bakvion app" : "Website";
  const leadsUrl = adminUrl
    ? `${adminUrl.replace(/\/$/, "")}/bkpadmin/leads`
    : "";
  const digits = whatsappDigits(l.phone);
  const greeting = encodeURIComponent(
    `Hello ${l.name}, this is Bakvion 👋 Thank you for your enquiry for ${l.business}. When is a good time to set up your automatic backups?`,
  );
  const waUrl = `https://wa.me/${digits}?text=${greeting}`;
  const telUrl = `tel:+${digits}`;

  const rows: [string, string][] = [
    ["Contact person", l.name],
    ["Phone", l.phone],
    ["Email", l.email || "—"],
    ["City", l.city || "—"],
    ["PCs needed", l.pcs ? String(l.pcs) : "—"],
    ["Received", when],
    ["From", source],
  ];

  const text = [
    `New Bakvion enquiry — ${l.business}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(l.message ? ["", `Message: ${l.message}`] : []),
    "",
    `WhatsApp: ${waUrl}`,
    ...(leadsUrl ? [`Open Leads: ${leadsUrl}`] : []),
    "",
    "Please contact them within 24 hours.",
    ...(l.ip ? [`IP: ${l.ip}`] : []),
  ].join("\n");

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;${
      primary
        ? "background:#f07a0f;color:#15171a;"
        : "background:#ffffff;color:#15171a;border:1px solid #d6d2ca;"
    }">${esc(label)}</a>`;

  const detailRows = rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 0;${i ? "border-top:1px solid #efece6;" : ""}color:#6c717a;font-size:13px;width:140px;vertical-align:top">${esc(k)}</td><td style="padding:10px 0;${i ? "border-top:1px solid #efece6;" : ""}color:#15171a;font-size:14px;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f5f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:28px 12px;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="padding:0 4px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:28px;height:28px;border-radius:14px;background:#f07a0f"></td>
      <td style="padding-left:10px;font-size:18px;font-weight:800;color:#15171a;letter-spacing:-0.3px">Bakvion</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid #e7e4de;border-radius:16px;padding:28px">
    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fdeedd;color:#a94f00;font-size:12px;font-weight:700">● New enquiry · ${esc(source)}</span>
    <h1 style="margin:14px 0 4px;font-size:24px;line-height:1.25;color:#15171a">${esc(l.business)}</h1>
    <p style="margin:0 0 20px;color:#6c717a;font-size:14px">${esc(l.name)} wants to connect with a Bakvion expert.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows}</table>
    ${
      l.message
        ? `<div style="margin-top:18px;padding:14px 16px;border-radius:12px;background:#f6f5f2;border-left:3px solid #f07a0f;color:#15171a;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(l.message)}</div>`
        : ""
    }
    <div style="margin-top:24px">
      ${button(waUrl, "💬 Reply on WhatsApp", true)}${button(telUrl, "📞 Call", false)}${leadsUrl ? button(leadsUrl, "Open Leads", false) : ""}
    </div>
    <p style="margin:12px 0 0;padding:12px 14px;border-radius:10px;background:#fff6ea;color:#8a4a00;font-size:13px">⏱ Please contact them within 24 hours — that's what they were promised.</p>
  </td></tr>
  <tr><td style="padding:16px 4px;color:#8a8f98;font-size:12px;line-height:1.5">
    Sent automatically by Bakvion · ${esc(when)}${l.ip ? ` · IP ${esc(l.ip)}` : ""}<br>Your Data. Always Protected.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

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
