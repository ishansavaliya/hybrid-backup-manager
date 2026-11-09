import { generateLoginCode, hashLoginCode } from "./codes";
import type { ServerEnv } from "./env";
import { EXPIRING_WINDOW_DAYS, endOfDayIST, extendExpiry } from "./membership";
import { hashPassword } from "./passwords";
import {
  isLoginNameShape,
  UsernameTakenError,
  type ClientSummary,
  type Repo,
} from "./repo";

/** Validation or lookup failure whose message is safe to show to the admin. */
export class AdminInputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AdminInputError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Only AdminInputError text reaches the page; anything else (e.g. raw DB errors) is hidden. */
export function publicErrorMessage(e: unknown): string {
  return e instanceof AdminInputError ? e.message : GENERIC_ERROR;
}

export const LOGIN_CODE_HOURS = 48;
export const MAX_RENEW_CONTACT = 500;
const CODE_ATTEMPTS = 5;
const MIN_PASSWORD = 8;

export type ClientFilter = "all" | "expiring" | "expired" | "blocked" | "test";

export interface NewClientInput {
  name: string;
  contactPerson: string;
  phone: string;
  notes: string;
  expiresOn: string;
  pcLimit: number;
  isTest: boolean;
}

export interface ClientDetailsPatch {
  name?: string;
  contactPerson?: string;
  phone?: string;
  notes?: string;
  isTest?: boolean;
}

/** Accepts only a real calendar date written exactly as YYYY-MM-DD. */
export function parseCalendarDate(date: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (
      probe.getUTCFullYear() === y &&
      probe.getUTCMonth() === mo - 1 &&
      probe.getUTCDate() === d
    ) {
      return endOfDayIST(date);
    }
  }
  throw new AdminInputError("Enter a valid date as YYYY-MM-DD");
}

function checkPcLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AdminInputError("PC limit must be a whole number from 1 to 100");
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new AdminInputError("Name is required");
  return trimmed;
}

async function mustGetClient(repo: Repo, id: string) {
  const client = isUuid(id) ? await repo.getClient(id) : null;
  if (!client) throw new AdminInputError("Client not found");
  return client;
}

export async function createClientAccount(
  repo: Repo,
  input: NewClientInput,
  now: Date,
): Promise<string> {
  const name = requireName(input.name);
  const expiresAt = parseCalendarDate(input.expiresOn);
  checkPcLimit(input.pcLimit);
  const id = await repo.createClient({
    name,
    contactPerson: input.contactPerson.trim(),
    phone: input.phone.trim(),
    notes: input.notes.trim(),
    expiresAt,
    pcLimit: input.pcLimit,
    blocked: false,
    isTest: input.isTest,
  });
  await repo.audit({
    actor: "admin",
    action: "client_created",
    clientId: id,
    details: {
      expiresAt: expiresAt.toISOString(),
      pcLimit: input.pcLimit,
      at: now.toISOString(),
    },
  });
  return id;
}

export async function updateClientDetails(
  repo: Repo,
  id: string,
  patch: ClientDetailsPatch,
): Promise<void> {
  await mustGetClient(repo, id);
  const clean: ClientDetailsPatch = {};
  if (patch.name !== undefined) clean.name = requireName(patch.name);
  if (patch.contactPerson !== undefined)
    clean.contactPerson = patch.contactPerson.trim();
  if (patch.phone !== undefined) clean.phone = patch.phone.trim();
  if (patch.notes !== undefined) clean.notes = patch.notes.trim();
  if (patch.isTest !== undefined) clean.isTest = patch.isTest;
  await repo.updateClient(id, clean);
  await repo.audit({
    actor: "admin",
    action: "client_updated",
    clientId: id,
    details: { fields: Object.keys(clean) },
  });
}

export async function setExpiryDate(
  repo: Repo,
  id: string,
  date: string,
): Promise<void> {
  const expiresAt = parseCalendarDate(date);
  await mustGetClient(repo, id);
  await repo.updateClient(id, { expiresAt });
  await repo.audit({
    actor: "admin",
    action: "expiry_set",
    clientId: id,
    details: { expiresAt: expiresAt.toISOString() },
  });
}

export async function extendMembership(
  repo: Repo,
  id: string,
  months: 1 | 3 | 12,
  now: Date,
): Promise<Date> {
  if (![1, 3, 12].includes(months))
    throw new AdminInputError("Months must be 1, 3 or 12");
  const client = await mustGetClient(repo, id);
  const expiresAt = extendExpiry(client.expiresAt, now, months);
  await repo.updateClient(id, { expiresAt });
  await repo.audit({
    actor: "admin",
    action: "membership_extended",
    clientId: id,
    details: { months, expiresAt: expiresAt.toISOString() },
  });
  return expiresAt;
}

export async function setPcLimit(
  repo: Repo,
  id: string,
  limit: number,
): Promise<void> {
  checkPcLimit(limit);
  await mustGetClient(repo, id);
  await repo.updateClient(id, { pcLimit: limit });
  await repo.audit({
    actor: "admin",
    action: "pc_limit_set",
    clientId: id,
    details: { pcLimit: limit },
  });
}

export async function setCredentials(
  repo: Repo,
  id: string,
  username: string,
  password: string,
): Promise<void> {
  if (!isLoginNameShape(username)) {
    throw new AdminInputError(
      "Username must be 3-64 characters: letters, numbers, dot, underscore or hyphen",
    );
  }
  if (password.length < MIN_PASSWORD) {
    throw new AdminInputError(
      `Password must be at least ${MIN_PASSWORD} characters`,
    );
  }
  await mustGetClient(repo, id);
  try {
    await repo.setLogin(id, username, await hashPassword(password));
  } catch (err) {
    if (err instanceof UsernameTakenError)
      throw new AdminInputError("Username already in use", { cause: err });
    throw err;
  }
  await repo.audit({
    actor: "admin",
    action: "credentials_set",
    clientId: id,
    details: { username },
  });
}

const IST_PARTS = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** `12 Nov 2026, 3:05 pm` in Asia/Kolkata. */
export function formatIST(date: Date): string {
  const p: Record<string, string> = {};
  for (const part of IST_PARTS.formatToParts(date)) p[part.type] = part.value;
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod?.toLowerCase()}`;
}

export function whatsappMessage(code: string, expiresAt: Date): string {
  return `Your Bakvion sign-in code is ${code}. It works once and expires on ${formatIST(expiresAt)} IST. Open Bakvion → Sign in → 6-digit code.`;
}

export async function issueLoginCode(
  repo: Repo,
  env: Pick<ServerEnv, "sessionSecret">,
  id: string,
  now: Date,
): Promise<{ code: string; expiresAt: Date; whatsappText: string }> {
  await mustGetClient(repo, id);
  const expiresAt = new Date(now.getTime() + LOGIN_CODE_HOURS * 3_600_000);
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = generateLoginCode();
    const stored = await repo.createLoginCode(
      id,
      hashLoginCode(code, env.sessionSecret),
      expiresAt,
    );
    if (stored) {
      await repo.audit({
        actor: "admin",
        action: "login_code_issued",
        clientId: id,
        details: { expiresAt: expiresAt.toISOString() },
      });
      return {
        code,
        expiresAt,
        whatsappText: whatsappMessage(code, expiresAt),
      };
    }
  }
  throw new AdminInputError(
    "Could not generate a unique code. Please try again.",
  );
}

export async function setBlocked(
  repo: Repo,
  id: string,
  blocked: boolean,
): Promise<void> {
  await mustGetClient(repo, id);
  await repo.updateClient(id, { blocked });
  await repo.audit({
    actor: "admin",
    action: blocked ? "client_blocked" : "client_unblocked",
    clientId: id,
  });
}

export async function removeClientDevice(
  repo: Repo,
  deviceId: string,
  now: Date,
  clientId: string,
): Promise<void> {
  if (!isUuid(deviceId) || !isUuid(clientId))
    throw new AdminInputError("PC not found");
  const devices = await repo.listDevices(clientId);
  if (!devices.some((d) => d.id === deviceId))
    throw new AdminInputError("PC not found");
  await repo.removeDevice(deviceId, now);
  await repo.audit({
    actor: "admin",
    action: "device_removed",
    clientId,
    deviceId,
  });
}

export async function deleteTestClient(repo: Repo, id: string): Promise<void> {
  const client = await mustGetClient(repo, id);
  if (!client.isTest)
    throw new AdminInputError("Only test clients can be deleted");
  await repo.deleteClient(id);
  await repo.audit({
    actor: "admin",
    action: "test_client_deleted",
    details: { name: client.name },
  });
}

export async function setRenewContact(repo: Repo, text: string): Promise<void> {
  const value = text.trim();
  if (value.length > MAX_RENEW_CONTACT) {
    throw new AdminInputError(
      `Renew contact must be ${MAX_RENEW_CONTACT} characters or fewer`,
    );
  }
  await repo.setSetting("renew_contact", value);
  await repo.audit({ actor: "admin", action: "renew_contact_set" });
}

export function filterClients(
  list: ClientSummary[],
  q: string,
  filter: ClientFilter,
  now: Date,
): ClientSummary[] {
  const needle = q.trim().toLowerCase();
  return list.filter((c) => {
    if (needle) {
      const hay = [c.name, c.contactPerson, c.phone, c.username ?? ""]
        .join("\n")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    const remaining = c.expiresAt.getTime() - now.getTime();
    switch (filter) {
      case "expiring":
        return remaining >= 0 && remaining <= EXPIRING_WINDOW_DAYS * 86_400_000;
      case "expired":
        return remaining < 0;
      case "blocked":
        return c.blocked;
      case "test":
        return c.isTest;
      default:
        return true;
    }
  });
}
