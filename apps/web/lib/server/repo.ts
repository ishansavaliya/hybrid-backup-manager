export type DeviceMode = "full" | "restore_only";

export interface ClientRecord {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  notes: string;
  expiresAt: Date;
  pcLimit: number;
  blocked: boolean;
  isTest: boolean;
  createdAt: Date;
}

export type ClientSummary = ClientRecord & {
  username: string | null;
  pcsUsed: number;
  lastSeenAt: Date | null;
};

export interface DeviceRecord {
  id: string;
  clientId: string;
  installId: string;
  machineName: string;
  windowsVersion: string;
  appVersion: string;
  mode: DeviceMode;
  firstSeenAt: Date;
  lastSeenAt: Date;
  removedAt: Date | null;
}

export interface DeviceInfo {
  installId: string;
  machineName: string;
  windowsVersion: string;
  appVersion: string;
}

export type RegisterOutcome =
  | { outcome: "ok"; clientId: string; deviceId: string; mode: DeviceMode }
  | { outcome: "pc_limit"; pcLimit: number }
  | { outcome: "code_invalid" };

export interface AuditEntry {
  actor: "admin" | "client" | "device" | "system";
  action: string;
  clientId?: string;
  deviceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export class UsernameTakenError extends Error {
  constructor() {
    super("Username already taken");
    this.name = "UsernameTakenError";
  }
}

export type ClientInput = Omit<ClientRecord, "id" | "createdAt">;

export interface Repo {
  findLogin(
    username: string,
  ): Promise<{ clientId: string; passwordHash: string } | null>;
  getClient(id: string): Promise<ClientRecord | null>;
  registerDevice(
    clientId: string,
    d: DeviceInfo,
    tokenHash: string,
    now: Date,
  ): Promise<RegisterOutcome>;
  signInWithCode(
    codeHmac: string,
    d: DeviceInfo,
    tokenHash: string,
    now: Date,
  ): Promise<RegisterOutcome>;
  deviceByToken(
    tokenHash: string,
  ): Promise<{ device: DeviceRecord; client: ClientRecord } | null>;
  /** Upgrade a restore-only device to full when the client is active and a PC slot is free. */
  promoteDevice(
    deviceId: string,
    now: Date,
  ): Promise<"full" | "restore_only" | "removed">;
  touchDevice(deviceId: string, appVersion: string, now: Date): Promise<void>;
  revokeToken(tokenHash: string, now: Date): Promise<void>;
  rateLimited(
    key: string,
    max: number,
    windowSeconds: number,
    now: Date,
  ): Promise<boolean>;
  recordFailure(key: string, windowSeconds: number, now: Date): Promise<void>;
  audit(e: AuditEntry): Promise<void>;
  listAudit(opts: {
    clientId?: string;
    limit: number;
  }): Promise<(AuditEntry & { id: number; at: Date })[]>;
  getSetting(key: "renew_contact"): Promise<string>;
  setSetting(key: "renew_contact", value: string): Promise<void>;
  listClients(): Promise<ClientSummary[]>;
  createClient(c: ClientInput): Promise<string>;
  updateClient(id: string, patch: Partial<ClientInput>): Promise<void>;
  deleteClient(id: string): Promise<void>;
  setLogin(
    clientId: string,
    username: string,
    passwordHash: string,
  ): Promise<void>;
  createLoginCode(
    clientId: string,
    codeHmac: string,
    expiresAt: Date,
  ): Promise<boolean>;
  listDevices(clientId: string): Promise<DeviceRecord[]>;
  removeDevice(deviceId: string, now: Date): Promise<void>;
  pruneAudit(olderThan: Date): Promise<number>;
  ping(): Promise<void>;
}

const LOGIN_NAME = /^[a-zA-Z0-9._-]{3,64}$/;

/** Usernames outside the admin-allowed alphabet can never match a login. */
export function isLoginNameShape(username: string): boolean {
  return LOGIN_NAME.test(username);
}

/** Exact case-insensitive match among candidate rows (e.g. from an ilike pre-filter). */
export function exactUsernameMatch<T extends { username: string }>(
  rows: readonly T[],
  input: string,
): T | null {
  const lower = input.toLowerCase();
  return rows.find((r) => r.username.toLowerCase() === lower) ?? null;
}
