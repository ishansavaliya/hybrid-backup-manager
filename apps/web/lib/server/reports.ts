import type { Mailer } from "./mailer";
import type {
  ClientRecord,
  DeviceRecord,
  ReportInput,
  ReportMode,
  ReportRecord,
  ReportScheduleKind,
  ReportState,
  Repo,
} from "./repo";
import { hashToken } from "./tokens";

// Backup-run email reports. PCs send finished runs; this decides what to
// email and renders the messages (email-client-safe HTML with inline styles).

export type ReportResult = { status: number; body: unknown };
type Ctx = { now: Date };

export const REPORT_LIMITS = {
  /** Report requests per PC per hour. */
  requests: 120,
  /** Emails per PC per day (Gmail allows ~500/day for the whole account). */
  emails: 40,
  /** Test emails per PC per day. */
  tests: 5,
  /** Reports per request. */
  batch: 50,
  recipients: 3,
} as const;
const HOUR = 3600;
const DAY = 86400;
/** More runs than this in one delivery are sent as a single summary. */
const SINGLE_MAX = 3;
const SUMMARY_ROWS = 50;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MODES: readonly ReportMode[] = ["all", "failures", "off"];
const STATES: readonly ReportState[] = ["succeeded", "failed", "interrupted"];
const KINDS: readonly ReportScheduleKind[] = [
  "manual",
  "hourly",
  "daily",
  "weekly",
];

const fail = (status: number, code: string, message: string) => ({
  status,
  body: { error: { code, message } },
});
const badRequest = () => fail(400, "bad_request", "Invalid request.");

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export interface ReportSettings {
  emails: string[];
  mode: ReportMode;
}

export function parseSettings(v: unknown): ReportSettings | null {
  if (!isRecord(v) || !Array.isArray(v.emails)) return null;
  if (!MODES.includes(v.mode as ReportMode)) return null;
  const emails: string[] = [];
  for (const raw of v.emails) {
    const e = typeof raw === "string" ? raw.trim() : "";
    if (!e) continue;
    if (e.length > 160 || !EMAIL.test(e)) return null;
    if (!emails.some((x) => x.toLowerCase() === e.toLowerCase()))
      emails.push(e);
  }
  if (emails.length > REPORT_LIMITS.recipients) return null;
  return { emails, mode: v.mode as ReportMode };
}

/** A malformed run is dropped (not the batch), so a PC's outbox never jams. */
export function parseReport(v: unknown, now: Date): ReportInput | null {
  if (!isRecord(v)) return null;
  const runId = typeof v.runId === "string" ? v.runId : "";
  const planName = text(v.planName, 120);
  const state = v.state as ReportState;
  const startedAt = new Date(String(v.startedAt));
  const finishedAt = new Date(String(v.finishedAt));
  if (!RUN_ID.test(runId) || !planName || !STATES.includes(state)) return null;
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(finishedAt.getTime()))
    return null;
  if (finishedAt.getTime() > now.getTime() + DAY * 1000) return null;
  const kind = v.scheduleKind as ReportScheduleKind;
  return {
    runId,
    planName,
    destinationName: text(v.destinationName, 120),
    scheduleKind: KINDS.includes(kind) ? kind : "manual",
    state,
    startedAt,
    finishedAt,
    error: text(v.error, 1000),
    notes: text(v.notes, 300),
  };
}

/** What happens to a new run's email under the PC's settings. */
export function routeReport(
  r: Pick<ReportInput, "state" | "scheduleKind">,
  s: ReportSettings,
): "now" | "digest" | "skip" {
  if (s.mode === "off" || !s.emails.length) return "skip";
  if (r.state === "succeeded") {
    if (s.mode === "failures") return "skip";
    // Hourly plans would mean 24 emails a day; they get one daily summary.
    if (r.scheduleKind === "hourly") return "digest";
  }
  return "now";
}

// ---------------------------------------------------------------- copy

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});
const IST_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const IST_DAY = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const ist = (d: Date) => `${IST_DATE_TIME.format(d)} IST`;

export function duration(from: Date, to: Date): string {
  const s = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} sec` : `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}

/** Plain-language cause and next steps for a failed or interrupted run. */
export function explain(r: Pick<ReportInput, "state" | "error">): {
  reason: string;
  steps: string[];
} {
  const e = r.error.toLowerCase();
  const runAgain = "Open Bakvion and click “Run backup” to try again.";
  if (r.state === "interrupted")
    return {
      reason:
        "The backup was stopped before it finished, usually because the PC was shut down or restarted.",
      steps: [
        "Nothing to fix: it runs again at the next scheduled time.",
        "To back up right away, open Bakvion and click “Run backup”.",
      ],
    };
  if (e.includes("not set up") || e.includes("key unavailable"))
    return {
      reason: "This backup destination is not set up yet.",
      steps: [
        "Open Bakvion → Backup plans.",
        "Click “Set up” next to the destination, then “Run backup”.",
      ],
    };
  if (
    e.includes("no space") ||
    e.includes("disk full") ||
    e.includes("not enough space")
  )
    return {
      reason: "The backup disk is full.",
      steps: [
        "Free up space on the backup disk, or connect a bigger one.",
        "Turn on “Delete old versions automatically” in Schedule & cleanup.",
        runAgain,
      ],
    };
  if (
    e.includes("wrong password") ||
    e.includes("cannot unlock") ||
    e.includes("no key found")
  )
    return {
      reason: "The encryption key does not match the backup on this disk.",
      steps: [
        "If this is a new PC, use “Connect existing” with the key from your recovery kit.",
        "Otherwise contact your Bakvion provider.",
      ],
    };
  if (e.includes("membership"))
    return {
      reason:
        "Your Bakvion membership is not active, so new backups are paused.",
      steps: ["Contact your Bakvion provider to renew."],
    };
  if (e.includes("source") || e.includes("access is denied"))
    return {
      reason: "Some of the folders being backed up could not be read.",
      steps: [
        "Check the folders still exist and are not on a disconnected drive.",
        runAgain,
      ],
    };
  if (
    e.includes("does not exist") ||
    e.includes("no such file") ||
    e.includes("cannot find") ||
    e.includes("unavailable") ||
    e.includes("not accessible") ||
    e.includes("unable to open") ||
    e.includes("not connected") ||
    e.includes("plug in") ||
    e.includes("exit status 10")
  )
    return {
      reason: "The backup disk or folder could not be reached.",
      steps: [
        "Connect the external disk and check it shows the same drive letter.",
        runAgain,
      ],
    };
  if (e.includes("currently using this disk") || e.includes("exit status 11"))
    return {
      reason: "Another backup or verification was already using this disk.",
      steps: ["Wait a moment for it to finish, then click “Run backup” again."],
    };
  return {
    reason: "The backup could not finish.",
    steps: [
      runAgain,
      "If it keeps failing, contact your Bakvion provider and share this email.",
    ],
  };
}

// ---------------------------------------------------------------- layout

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const C = {
  page: "#f6f5f2",
  card: "#ffffff",
  line: "#e7e4de",
  soft: "#efece6",
  text: "#15171a",
  muted: "#6c717a",
  faint: "#8a8f98",
  accent: "#f07a0f",
};
const TONE = {
  ok: { fg: "#13734b", bg: "#e3f4ec", icon: "✓", word: "Completed" },
  bad: { fg: "#b42318", bg: "#fdeceb", icon: "✕", word: "Failed" },
  warn: { fg: "#9a5b00", bg: "#fff3dc", icon: "!", word: "Interrupted" },
  info: { fg: "#a94f00", bg: "#fdeedd", icon: "✉", word: "" },
} as const;
type Tone = keyof typeof TONE;
const toneOf = (s: ReportState): Tone =>
  s === "succeeded" ? "ok" : s === "failed" ? "bad" : "warn";

const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

function hero(tone: Tone, title: string, sub: string) {
  const t = TONE[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td width="52" valign="top"><div style="width:44px;height:44px;border-radius:22px;background:${t.bg};color:${t.fg};font-size:22px;font-weight:800;line-height:44px;text-align:center">${t.icon}</div></td>
<td valign="middle"><div style="font-size:22px;line-height:1.25;font-weight:800;color:${C.text};letter-spacing:-0.3px">${esc(title)}</div>
<div style="margin-top:3px;font-size:14px;color:${C.muted}">${esc(sub)}</div></td>
</tr></table>`;
}

function details(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px">${rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 0;${i ? `border-top:1px solid ${C.soft};` : ""}color:${C.muted};font-size:13px;width:130px;vertical-align:top">${esc(k)}</td><td style="padding:10px 0;${i ? `border-top:1px solid ${C.soft};` : ""}color:${C.text};font-size:14px;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

function problem(tone: Tone, r: Pick<ReportInput, "state" | "error">) {
  const t = TONE[tone];
  const { reason, steps } = explain(r);
  return `<div style="margin-top:22px;padding:16px 18px;border-radius:12px;background:${t.bg};border-left:4px solid ${t.fg}">
<div style="font-size:12px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:${t.fg}">What happened</div>
<div style="margin-top:4px;font-size:15px;font-weight:700;color:${C.text}">${esc(reason)}</div>
<div style="margin-top:12px;font-size:12px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:${t.fg}">What to do</div>
<ol style="margin:6px 0 0;padding-left:20px;color:${C.text};font-size:14px;line-height:1.6">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
</div>${
    r.error
      ? `<div style="margin-top:12px;font-size:12px;color:${C.faint}">Technical details</div>
<div style="margin-top:4px;padding:10px 12px;border-radius:8px;background:${C.page};color:${C.muted};font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.5;word-break:break-word;white-space:pre-wrap">${esc(r.error)}</div>`
      : ""
  }`;
}

function shell(opts: {
  preheader: string;
  body: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Bakvion</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:28px 12px;font-family:${FONT}">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
  <tr><td style="padding:0 4px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:28px;height:28px;border-radius:14px;background:${C.accent}"></td>
      <td style="padding-left:10px;font-size:18px;font-weight:800;color:${C.text};letter-spacing:-0.3px">Bakvion</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:28px">${opts.body}</td></tr>
  <tr><td style="padding:16px 4px;color:${C.faint};font-size:12px;line-height:1.6">${opts.footer}<br>Your Data. Always Protected.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export interface ReportContext {
  client: Pick<ClientRecord, "name">;
  device: Pick<DeviceRecord, "machineName">;
  settings: ReportSettings;
  /** Owner's renew/support contact, shown in the footer when set. */
  contact: string;
  now: Date;
}

type Mail = { subject: string; text: string; html: string };

function footer(c: ReportContext): { html: string; text: string } {
  const pc = c.device.machineName || "this PC";
  const line = `You receive this because this address was added in Bakvion → Settings → Email reports on ${pc}. Change or stop these emails there.`;
  const help = c.contact ? `Need help? Contact ${c.contact}.` : "";
  return {
    html: `${esc(line)}${help ? `<br>${esc(help)}` : ""}`,
    text: [line, help].filter(Boolean).join("\n"),
  };
}

const pcName = (c: ReportContext) => c.device.machineName || "Unnamed PC";
const route = (r: Pick<ReportInput, "planName" | "destinationName">) =>
  r.destinationName ? `${r.planName} → ${r.destinationName}` : r.planName;

/** One run: completed, failed or interrupted. */
/** Splits a run's notes (one per line) into the cleanup result and warnings. */
export function readNotes(notes: string): {
  cleanup: string | null;
  size: string | null;
  warnings: string[];
  /** Notes that need no action (e.g. the disk moved to another letter). */
  info: string[];
} {
  let cleanup: string | null = null;
  let size: string | null = null;
  const warnings: string[] = [];
  const info: string[] = [];
  for (const raw of notes.split("\n").map((l) => l.trim())) {
    if (!raw) continue;
    if (raw.startsWith("Data transferred: "))
      size = raw.slice("Data transferred: ".length).trim();
    else if (raw === "Old versions cleaned up")
      cleanup = "Old versions cleaned up";
    else if (raw.startsWith("Cleanup skipped"))
      cleanup = "Skipped this time (backup is safe)";
    else if (raw.startsWith("Backed up without a Windows snapshot"))
      warnings.push(
        "Windows could not take a snapshot, so files open in other programs (like Tally) may have been skipped.",
      );
    else if (raw.startsWith("Windows snapshot unavailable"))
      warnings.push(
        "Windows could not take a snapshot of one drive; open files there were read directly.",
      );
    else if (raw.startsWith("Some files could not be read"))
      warnings.push(
        "Some files could not be read (often because another program had them open) and were skipped. Older versions were kept.",
      );
    else {
      const full = /^Backup disk is (\d+)% full \((.+) free\)$/.exec(raw);
      const moved = /^Backup disk found at (.+) \(was (.+)\)$/.exec(raw);
      if (full)
        warnings.push(
          `The backup disk is ${full[1]}% full (${full[2]} free). Free up space or turn on “Delete old versions automatically”.`,
        );
      else if (moved)
        info.push(
          `The backup disk was found at ${moved[1]} (it was ${moved[2]} before). No action needed.`,
        );
      else info.push(raw);
    }
  }
  return { cleanup, size, warnings, info };
}

function noteBox(tone: Tone, label: string, lines: string[]) {
  if (!lines.length) return "";
  const t = TONE[tone];
  return `<div style="margin-top:16px;padding:14px 16px;border-radius:12px;background:${t.bg};border-left:4px solid ${t.fg}">
<div style="font-size:12px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:${t.fg}">${esc(label)}</div>
<ul style="margin:6px 0 0;padding-left:18px;color:${C.text};font-size:14px;line-height:1.6">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
</div>`;
}

/** One run: completed, failed or interrupted. */
export function singleReportEmail(r: ReportInput, c: ReportContext): Mail {
  const notes = readNotes(r.notes);
  const ok = r.state === "succeeded";
  const warned = ok && notes.warnings.length > 0;
  const tone = warned ? "warn" : toneOf(r.state);
  const title = warned
    ? "Backup completed with warnings"
    : ok
      ? "Backup completed"
      : r.state === "failed"
        ? "Backup failed"
        : "Backup interrupted";
  const emoji = warned ? "⚠️" : ok ? "✅" : r.state === "failed" ? "❌" : "⚠️";
  const rows: [string, string][] = [
    ["Business", c.client.name],
    ["PC", pcName(c)],
    ["Plan", r.planName],
    ["Saved to", r.destinationName || "—"],
    ["Started", ist(r.startedAt)],
    ["Took", duration(r.startedAt, r.finishedAt)],
  ];
  if (notes.size) rows.push(["Data transferred", notes.size]);
  if (notes.cleanup) rows.push(["Cleanup", notes.cleanup]);
  const f = footer(c);
  const body = `${hero(tone, title, route(r))}${details(rows)}${
    ok
      ? warned
        ? ""
        : `<p style="margin:20px 0 0;padding:12px 14px;border-radius:10px;background:${TONE.ok.bg};color:${TONE.ok.fg};font-size:14px;font-weight:600">🔒 Your files are encrypted and safely stored. No action needed.</p>`
      : problem(toneOf(r.state), r)
  }${noteBox("warn", "Please note", notes.warnings)}${noteBox("info", "Good to know", notes.info)}`;
  const explained = ok ? null : explain(r);
  return {
    subject: `${emoji} ${title} · ${r.planName} · ${c.client.name}`,
    html: shell({
      preheader: explained
        ? `${explained.reason} ${explained.steps[0]}`
        : warned
          ? notes.warnings[0]!
          : `${r.planName} backed up at ${IST_TIME.format(r.finishedAt)}.`,
      body,
      footer: f.html,
    }),
    text: [
      `${title} — ${route(r)}`,
      "",
      ...rows.map(([k, v]) => `${k}: ${v}`),
      ...(explained
        ? [
            "",
            `What happened: ${explained.reason}`,
            "What to do:",
            ...explained.steps.map((s, i) => `${i + 1}. ${s}`),
            ...(r.error ? ["", `Technical details: ${r.error}`] : []),
          ]
        : warned
          ? []
          : [
              "",
              "Your files are encrypted and safely stored. No action needed.",
            ]),
      ...(notes.warnings.length
        ? ["", "Please note:", ...notes.warnings.map((w) => `- ${w}`)]
        : []),
      ...(notes.info.length
        ? ["", "Good to know:", ...notes.info.map((w) => `- ${w}`)]
        : []),
      "",
      f.text,
    ].join("\n"),
  };
}

/** Several runs at once (after time offline) or the daily hourly-plan summary. */
export function summaryReportEmail(
  runs: ReportInput[],
  c: ReportContext,
  kind: "batch" | "daily",
): Mail {
  const sorted = [...runs].sort(
    (a, b) => b.finishedAt.getTime() - a.finishedAt.getTime(),
  );
  const count = (s: ReportState) => runs.filter((r) => r.state === s).length;
  const okN = count("succeeded");
  const badN = count("failed");
  const warnN = count("interrupted");
  const allOk = badN === 0 && warnN === 0;
  const title = allOk
    ? `All ${runs.length} backups completed`
    : badN
      ? `${badN} of ${runs.length} backups failed`
      : `${warnN} of ${runs.length} backups were interrupted`;
  const sub =
    kind === "daily"
      ? `Daily summary · ${IST_DAY.format(c.now)}`
      : `${c.client.name} · ${pcName(c)}`;
  const stat = (n: number, label: string, tone: Tone) =>
    `<td width="33%" style="padding:12px;border-radius:12px;background:${n ? TONE[tone].bg : C.page};text-align:center"><div style="font-size:22px;font-weight:800;color:${n ? TONE[tone].fg : C.faint}">${n}</div><div style="margin-top:2px;font-size:12px;font-weight:700;color:${n ? TONE[tone].fg : C.faint}">${label}</div></td>`;
  const stats = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:separate;border-spacing:8px 0"><tr>${stat(okN, "Completed", "ok")}${stat(badN, "Failed", "bad")}${stat(warnN, "Interrupted", "warn")}</tr></table>`;
  const shown = sorted.slice(0, SUMMARY_ROWS);
  const rows = shown
    .map((r, i) => {
      const t = TONE[toneOf(r.state)];
      const warning =
        r.state === "succeeded" ? readNotes(r.notes).warnings[0] : undefined;
      const reason =
        r.state === "succeeded" ? (warning ?? "") : explain(r).reason;
      const reasonColor = warning ? TONE.warn.fg : t.fg;
      return `<tr><td style="padding:11px 0;${i ? `border-top:1px solid ${C.soft};` : ""}vertical-align:top;width:22px"><span style="display:inline-block;width:18px;height:18px;border-radius:9px;background:${t.bg};color:${t.fg};font-size:11px;font-weight:800;line-height:18px;text-align:center">${t.icon}</span></td>
<td style="padding:11px 8px;${i ? `border-top:1px solid ${C.soft};` : ""}vertical-align:top"><div style="font-size:14px;font-weight:700;color:${C.text}">${esc(route(r))}</div>${reason ? `<div style="margin-top:2px;font-size:13px;color:${reasonColor}">${esc(reason)}</div>` : ""}</td>
<td style="padding:11px 0;${i ? `border-top:1px solid ${C.soft};` : ""}vertical-align:top;text-align:right;white-space:nowrap;font-size:13px;color:${C.muted}">${esc(IST_TIME.format(r.finishedAt))}</td></tr>`;
    })
    .join("");
  const more =
    sorted.length > shown.length
      ? `<p style="margin:8px 0 0;font-size:13px;color:${C.muted}">…and ${sorted.length - shown.length} more. Open Bakvion → History for the full list.</p>`
      : "";
  // A failure needs action; an interruption only fixes itself.
  const firstBad =
    sorted.find((r) => r.state === "failed") ??
    sorted.find((r) => r.state === "interrupted");
  const badTone = TONE[firstBad?.state === "failed" ? "bad" : "warn"];
  const action = firstBad
    ? `<p style="margin:20px 0 0;padding:12px 14px;border-radius:10px;background:${badTone.bg};color:${badTone.fg};font-size:14px;font-weight:600">What to do: ${esc(explain(firstBad).steps[0]!)}</p>`
    : `<p style="margin:20px 0 0;padding:12px 14px;border-radius:10px;background:${TONE.ok.bg};color:${TONE.ok.fg};font-size:14px;font-weight:600">🔒 Your files are encrypted and safely stored. No action needed.</p>`;
  const f = footer(c);
  const body = `${hero(allOk ? "ok" : badN ? "bad" : "warn", title, sub)}${stats}
<div style="margin-top:22px;font-size:12px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:${C.faint}">${kind === "daily" ? "Hourly backups" : "Backup runs"} · ${esc(pcName(c))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px">${rows}</table>${more}${action}`;
  const emoji = allOk ? "✅" : badN ? "❌" : "⚠️";
  const subject =
    kind === "daily"
      ? `${emoji} Daily backup summary · ${okN} completed${badN ? ` · ${badN} failed` : ""} · ${c.client.name}`
      : `${emoji} ${title} · ${c.client.name}`;
  return {
    subject,
    html: shell({
      preheader: `${okN} completed, ${badN} failed, ${warnN} interrupted on ${pcName(c)}.`,
      body,
      footer: f.html,
    }),
    text: [
      title,
      sub,
      "",
      `Completed: ${okN}   Failed: ${badN}   Interrupted: ${warnN}`,
      "",
      ...shown.map(
        (r) =>
          `${r.state === "succeeded" ? "✓" : r.state === "failed" ? "✕" : "!"} ${route(r)} — ${IST_TIME.format(r.finishedAt)}${
            r.state === "succeeded" ? "" : ` — ${explain(r).reason}`
          }`,
      ),
      ...(sorted.length > shown.length
        ? [`…and ${sorted.length - shown.length} more.`]
        : []),
      "",
      f.text,
    ].join("\n"),
  };
}

/** Confirms the addresses work. */
export function testReportEmail(c: ReportContext): Mail {
  const modeText =
    c.settings.mode === "all"
      ? "after every backup (hourly plans: one summary a day)"
      : c.settings.mode === "failures"
        ? "only when a backup fails"
        : "never — reports are turned off";
  const f = footer(c);
  const body = `${hero("info", "Email reports are working", `${c.client.name} · ${pcName(c)}`)}
<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:${C.text}">This is a test email from Bakvion. Backup reports for this PC will arrive here <strong>${esc(modeText)}</strong>.</p>
${details([
  ["Sent to", c.settings.emails.join(", ")],
  ["PC", pcName(c)],
  ["Sent at", ist(c.now)],
])}
<p style="margin:20px 0 0;padding:12px 14px;border-radius:10px;background:${TONE.info.bg};color:${TONE.info.fg};font-size:14px;font-weight:600">💡 Tip: add the sender of this email to your contacts so reports never land in spam.</p>`;
  return {
    subject: `✉️ Bakvion email reports are on · ${c.client.name}`,
    html: shell({
      preheader: `Backup reports for ${pcName(c)} will arrive here.`,
      body,
      footer: f.html,
    }),
    text: [
      "Email reports are working",
      "",
      `This is a test email from Bakvion. Backup reports for ${pcName(c)} will arrive here ${modeText}.`,
      `Sent to: ${c.settings.emails.join(", ")}`,
      `Sent at: ${ist(c.now)}`,
      "",
      f.text,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------- delivery

export interface ReportDeps {
  repo: Repo;
  mailer: Mailer | null;
  /** Optional founder/admin address that receives every failed/interrupted backup alert. */
  adminAlertEmail?: string;
}

function mergeRecipients(
  runs: Pick<ReportInput, "state">[],
  settings: ReportSettings,
  adminAlertEmail?: string,
): string[] {
  const hasError = runs.some((r) => r.state !== "succeeded");
  const out: string[] = [];
  if (settings.mode !== "off") {
    for (const e of settings.emails) {
      if (!out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
    }
  }
  const admin = (adminAlertEmail ?? "").trim();
  if (hasError && admin && EMAIL.test(admin)) {
    if (!out.some((x) => x.toLowerCase() === admin.toLowerCase()))
      out.push(admin);
  }
  return out;
}

async function contactFor(repo: Repo): Promise<string> {
  return (await repo.getSetting("renew_contact")).trim();
}

const replyTo = (contact: string) =>
  EMAIL.test(contact) ? contact : undefined;

/** Sends one email within the PC's daily allowance. */
async function deliver(
  deps: ReportDeps & { mailer: Mailer },
  deviceId: string,
  to: string[],
  mail: Mail,
  contact: string,
  now: Date,
): Promise<"sent" | "skipped" | "failed"> {
  const key = `reports:mail:${deviceId}`;
  if (await deps.repo.rateLimited(key, REPORT_LIMITS.emails, DAY, now))
    return "skipped";
  await deps.repo.recordFailure(key, DAY, now);
  try {
    await deps.mailer.send({
      to: to.join(", "),
      ...mail,
      replyTo: replyTo(contact),
    });
    return "sent";
  } catch (err) {
    console.error(
      "report email failed:",
      err instanceof Error ? err.message : typeof err,
    );
    return "failed";
  }
}

/** POST /api/v1/device/reports: settings + finished runs (+ optional test). */
export async function submitReports(
  deps: ReportDeps,
  bearer: string | null,
  body: unknown,
  ctx: Ctx,
): Promise<ReportResult> {
  const { repo } = deps;
  if (bearer === null || !TOKEN_SHAPE.test(bearer))
    return fail(401, "unauthorized", "Sign in again.");
  if (!isRecord(body) || !Array.isArray(body.reports)) return badRequest();
  if (body.reports.length > REPORT_LIMITS.batch) return badRequest();
  const settings = parseSettings(body.settings);
  if (!settings) return badRequest();

  const found = await repo.deviceByToken(hashToken(bearer));
  if (!found)
    return fail(401, "device_removed", "This PC was removed or signed out.");
  const { device, client } = found;
  const reqKey = `reports:req:${device.id}`;
  if (await repo.rateLimited(reqKey, REPORT_LIMITS.requests, HOUR, ctx.now))
    return fail(429, "rate_limited", "Too many requests. Try again later.");
  await repo.recordFailure(reqKey, HOUR, ctx.now);

  if (
    settings.mode !== device.reportMode ||
    settings.emails.join("\n") !== device.reportEmails.join("\n")
  )
    await repo.setReportSettings(device.id, settings.emails, settings.mode);

  const contact = await contactFor(repo);
  const rc: ReportContext = { client, device, settings, contact, now: ctx.now };

  if (body.test === true) {
    if (!settings.emails.length)
      return fail(400, "bad_request", "Add an email address first.");
    if (!deps.mailer)
      return fail(
        503,
        "email_unavailable",
        "Email is not set up on the server yet.",
      );
    const testKey = `reports:test:${device.id}`;
    if (await repo.rateLimited(testKey, REPORT_LIMITS.tests, DAY, ctx.now))
      return fail(
        429,
        "rate_limited",
        "Too many test emails today. Try again tomorrow.",
      );
    await repo.recordFailure(testKey, DAY, ctx.now);
    const outcome = await deliver(
      { ...deps, mailer: deps.mailer },
      device.id,
      settings.emails,
      testReportEmail(rc),
      contact,
      ctx.now,
    );
    if (outcome !== "sent")
      return fail(
        502,
        "email_failed",
        "The test email could not be sent. Try again later.",
      );
  }

  const parsed = body.reports.flatMap((r) => {
    const v = parseReport(r, ctx.now);
    return v ? [v] : [];
  });
  const added = await repo.addReports(device.id, client.id, parsed, ctx.now);
  const adminEmail = (deps.adminAlertEmail ?? "").trim();
  const hasAdminAlert = !!adminEmail && EMAIL.test(adminEmail);
  const now: ReportRecord[] = [];
  const digest: string[] = [];
  const skip: string[] = [];
  for (const r of added) {
    const where = routeReport(r, settings);
    if (where === "now" || (r.state !== "succeeded" && hasAdminAlert))
      now.push(r);
    else (where === "digest" ? digest : skip).push(r.id);
  }
  await repo.setReportEmailStatus(digest, "digest");
  await repo.setReportEmailStatus(skip, "skipped");

  // Without SMTP, immediate runs stay "pending" (kept for the admin view).
  if (deps.mailer && now.length) {
    const d = { ...deps, mailer: deps.mailer };
    const groups =
      now.length > SINGLE_MAX
        ? [
            {
              ids: now.map((r) => r.id),
              runs: now,
              mail: summaryReportEmail(now, rc, "batch"),
            },
          ]
        : now.map((r) => ({
            ids: [r.id],
            runs: [r],
            mail: singleReportEmail(r, rc),
          }));
    for (const g of groups) {
      const recipients = mergeRecipients(g.runs, settings, adminEmail);
      if (!recipients.length) {
        await repo.setReportEmailStatus(g.ids, "skipped");
        continue;
      }
      const outcome = await deliver(
        d,
        device.id,
        recipients,
        g.mail,
        contact,
        ctx.now,
      );
      await repo.setReportEmailStatus(g.ids, outcome);
    }
  }
  return { status: 200, body: { ok: true, received: added.length } };
}

/** Daily cron: one summary per PC for its successful hourly runs. */
export async function runReportDigest(
  deps: ReportDeps,
  now: Date,
): Promise<{ digests: number }> {
  if (!deps.mailer) return { digests: 0 };
  const d = { ...deps, mailer: deps.mailer };
  const rows = await deps.repo.digestReports(5000);
  const byDevice = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byDevice.get(r.deviceId) ?? [];
    list.push(r);
    byDevice.set(r.deviceId, list);
  }
  const contact = await contactFor(deps.repo);
  let digests = 0;
  for (const list of byDevice.values()) {
    const { device, client } = list[0]!;
    const ids = list.map((r) => r.id);
    const settings = { emails: device.reportEmails, mode: device.reportMode };
    // Settings may have changed since the runs arrived.
    if (
      device.removedAt ||
      settings.mode !== "all" ||
      !settings.emails.length
    ) {
      await deps.repo.setReportEmailStatus(ids, "skipped");
      continue;
    }
    const rc: ReportContext = { client, device, settings, contact, now };
    const outcome = await deliver(
      d,
      device.id,
      settings.emails,
      summaryReportEmail(list, rc, "daily"),
      contact,
      now,
    );
    await deps.repo.setReportEmailStatus(ids, outcome);
    if (outcome === "sent") digests++;
  }
  return { digests };
}
