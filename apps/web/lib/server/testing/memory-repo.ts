import { randomUUID } from "node:crypto";
import {
  isLoginNameShape,
  UsernameTakenError,
  type AuditEntry,
  type ClientRecord,
  type ClientSummary,
  type DeviceInfo,
  type DeviceRecord,
  type RegisterOutcome,
  type Repo,
} from "../repo";

export interface MemoryCode {
  id: string;
  clientId: string;
  codeHmac: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  usedDeviceId: string | null;
}

interface MemoryToken {
  deviceId: string;
  tokenHash: string;
  revokedAt: Date | null;
}

type AuditRow = AuditEntry & { id: number; at: Date };

/** In-memory Repo mirroring the SQL semantics of 202611100001_accounts.sql. For tests only. */
export function createMemoryRepo(seed?: {
  clients?: ClientRecord[];
}): Repo & { codes: Map<string, MemoryCode>; devices: DeviceRecord[] } {
  const clients = new Map<string, ClientRecord>();
  for (const c of seed?.clients ?? []) clients.set(c.id, { ...c });
  const logins = new Map<string, { username: string; passwordHash: string }>();
  const codes = new Map<string, MemoryCode>();
  const devices: DeviceRecord[] = [];
  const tokens: MemoryToken[] = [];
  const limits = new Map<string, { windowStart: Date; failures: number }>();
  const auditRows: AuditRow[] = [];
  const settings = new Map<string, string>([["renew_contact", ""]]);
  let auditSeq = 0;

  const windowOver = (start: Date, seconds: number, now: Date) =>
    start.getTime() + seconds * 1000 <= now.getTime();

  function register(
    clientId: string,
    d: DeviceInfo,
    tokenHash: string,
    now: Date,
  ): RegisterOutcome | "client_missing" {
    const client = clients.get(clientId);
    if (!client) return "client_missing";
    let mode: "full" | "restore_only";
    if (client.blocked || client.expiresAt.getTime() < now.getTime()) {
      mode = "restore_only";
    } else {
      mode = "full";
      const used = devices.filter(
        (x) =>
          x.clientId === clientId &&
          x.mode === "full" &&
          x.removedAt === null &&
          x.installId !== d.installId,
      ).length;
      if (used >= client.pcLimit) {
        return { outcome: "pc_limit", pcLimit: client.pcLimit };
      }
    }
    if (tokens.some((t) => t.tokenHash === tokenHash)) {
      throw new Error("Token hash already exists");
    }
    let device = devices.find(
      (x) => x.clientId === clientId && x.installId === d.installId,
    );
    if (device) {
      device.removedAt = null;
      device.mode = mode;
      device.lastSeenAt = now;
      device.machineName = d.machineName;
      device.windowsVersion = d.windowsVersion;
      device.appVersion = d.appVersion;
    } else {
      device = {
        id: randomUUID(),
        clientId,
        installId: d.installId,
        machineName: d.machineName,
        windowsVersion: d.windowsVersion,
        appVersion: d.appVersion,
        mode,
        firstSeenAt: now,
        lastSeenAt: now,
        removedAt: null,
      };
      devices.push(device);
    }
    // Re-registering the same PC replaces its session: older tokens stop working.
    for (const t of tokens) {
      if (t.deviceId === device.id && !t.revokedAt) t.revokedAt = now;
    }
    tokens.push({ deviceId: device.id, tokenHash, revokedAt: null });
    return { outcome: "ok", clientId, deviceId: device.id, mode };
  }

  function unwrap(r: RegisterOutcome | "client_missing"): RegisterOutcome {
    if (r === "client_missing") throw new Error("Client not found");
    return r;
  }

  return {
    codes,
    devices,

    async findLogin(username) {
      if (!isLoginNameShape(username)) return null;
      const lower = username.toLowerCase();
      for (const [clientId, l] of logins) {
        if (l.username.toLowerCase() === lower) {
          return { clientId, passwordHash: l.passwordHash };
        }
      }
      return null;
    },

    async getClient(id) {
      const c = clients.get(id);
      return c ? { ...c } : null;
    },

    async registerDevice(clientId, d, tokenHash, now) {
      return unwrap(register(clientId, d, tokenHash, now));
    },

    async signInWithCode(codeHmac, d, tokenHash, now) {
      const code = [...codes.values()].find(
        (c) =>
          c.codeHmac === codeHmac &&
          c.usedAt === null &&
          c.expiresAt.getTime() > now.getTime(),
      );
      if (!code) return { outcome: "code_invalid" };
      const r = unwrap(register(code.clientId, d, tokenHash, now));
      if (r.outcome === "ok") {
        code.usedAt = now;
        code.usedDeviceId = r.deviceId;
      }
      return r;
    },

    async deviceByToken(tokenHash) {
      const t = tokens.find((x) => x.tokenHash === tokenHash);
      if (!t || t.revokedAt) return null;
      const device = devices.find((x) => x.id === t.deviceId);
      if (!device || device.removedAt) return null;
      const client = clients.get(device.clientId);
      if (!client) return null;
      return { device: { ...device }, client: { ...client } };
    },

    async promoteDevice(deviceId, now) {
      const device = devices.find((x) => x.id === deviceId);
      if (!device || device.removedAt) return "removed";
      const client = clients.get(device.clientId);
      if (!client) return "removed";
      if (client.blocked || client.expiresAt.getTime() < now.getTime())
        return device.mode;
      if (device.mode === "full") return "full";
      const used = devices.filter(
        (x) =>
          x.clientId === client.id &&
          x.mode === "full" &&
          x.removedAt === null &&
          x.id !== deviceId,
      ).length;
      if (used < client.pcLimit) {
        device.mode = "full";
        return "full";
      }
      return "restore_only";
    },

    async touchDevice(deviceId, appVersion, now) {
      const device = devices.find((x) => x.id === deviceId);
      if (device) {
        device.appVersion = appVersion;
        device.lastSeenAt = now;
      }
    },

    async revokeToken(tokenHash, now) {
      for (const t of tokens) {
        if (t.tokenHash === tokenHash && !t.revokedAt) t.revokedAt = now;
      }
    },

    async signOutDevice(deviceId, now) {
      const device = devices.find((x) => x.id === deviceId);
      if (device) device.mode = "restore_only";
      for (const t of tokens) {
        if (t.deviceId === deviceId && !t.revokedAt) t.revokedAt = now;
      }
    },

    async rateLimited(key, max, windowSeconds, now) {
      const row = limits.get(key);
      if (!row) return false;
      if (windowOver(row.windowStart, windowSeconds, now)) return false;
      return row.failures >= max;
    },

    async recordFailure(key, windowSeconds, now) {
      const row = limits.get(key);
      if (!row) {
        limits.set(key, { windowStart: now, failures: 1 });
      } else if (windowOver(row.windowStart, windowSeconds, now)) {
        row.windowStart = now;
        row.failures = 1;
      } else {
        row.failures += 1;
      }
    },

    async audit(e) {
      auditRows.push({
        id: ++auditSeq,
        at: new Date(),
        actor: e.actor,
        action: e.action,
        clientId: e.clientId,
        deviceId: e.deviceId,
        details: e.details ?? {},
        ip: e.ip ?? "",
      });
    },

    async listAudit({ clientId, limit }) {
      return auditRows
        .filter((r) => clientId === undefined || r.clientId === clientId)
        .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id - a.id)
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },

    async getSetting(key) {
      return settings.get(key) ?? "";
    },

    async setSetting(key, value) {
      settings.set(key, value);
    },

    async listClients() {
      const out: ClientSummary[] = [];
      for (const c of clients.values()) {
        const live = devices.filter(
          (d) => d.clientId === c.id && d.removedAt === null,
        );
        const lastSeen = live.reduce<Date | null>(
          (m, d) => (m === null || d.lastSeenAt > m ? d.lastSeenAt : m),
          null,
        );
        out.push({
          ...c,
          username: logins.get(c.id)?.username ?? null,
          pcsUsed: live.filter((d) => d.mode === "full").length,
          lastSeenAt: lastSeen,
        });
      }
      return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async createClient(c) {
      const id = randomUUID();
      clients.set(id, { ...c, id, createdAt: new Date() });
      return id;
    },

    async updateClient(id, patch) {
      const c = clients.get(id);
      if (!c) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) (c as unknown as Record<string, unknown>)[k] = v;
      }
    },

    async deleteClient(id) {
      clients.delete(id);
      logins.delete(id);
      for (const [cid, c] of codes) if (c.clientId === id) codes.delete(cid);
      for (let i = devices.length - 1; i >= 0; i--) {
        const d = devices[i]!;
        if (d.clientId !== id) continue;
        devices.splice(i, 1);
        for (let j = tokens.length - 1; j >= 0; j--) {
          if (tokens[j]!.deviceId === d.id) tokens.splice(j, 1);
        }
      }
      for (const r of auditRows) if (r.clientId === id) r.clientId = undefined;
    },

    async setLogin(clientId, username, passwordHash) {
      const lower = username.toLowerCase();
      for (const [cid, l] of logins) {
        if (cid !== clientId && l.username.toLowerCase() === lower) {
          throw new UsernameTakenError();
        }
      }
      logins.set(clientId, { username, passwordHash });
    },

    async createLoginCode(clientId, codeHmac, expiresAt) {
      const now = Date.now();
      for (const [id, c] of codes) {
        if (
          c.codeHmac === codeHmac &&
          c.usedAt === null &&
          c.expiresAt.getTime() < now
        ) {
          codes.delete(id);
        }
      }
      for (const c of codes.values()) {
        if (c.codeHmac === codeHmac && c.usedAt === null) return false;
      }
      const id = randomUUID();
      codes.set(id, {
        id,
        clientId,
        codeHmac,
        createdAt: new Date(),
        expiresAt,
        usedAt: null,
        usedDeviceId: null,
      });
      return true;
    },

    async listDevices(clientId) {
      return devices
        .filter((d) => d.clientId === clientId)
        .map((d) => ({ ...d }))
        .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    },

    async removeDevice(deviceId, now) {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) return;
      device.removedAt = now;
      for (const t of tokens) {
        if (t.deviceId === deviceId && !t.revokedAt) t.revokedAt = now;
      }
    },

    async pruneAudit(olderThan) {
      let n = 0;
      for (let i = auditRows.length - 1; i >= 0; i--) {
        if (auditRows[i]!.at.getTime() < olderThan.getTime()) {
          auditRows.splice(i, 1);
          n++;
        }
      }
      return n;
    },

    async pruneRateLimits(olderThan) {
      let n = 0;
      for (const [key, row] of limits) {
        if (row.windowStart.getTime() < olderThan.getTime()) {
          limits.delete(key);
          n++;
        }
      }
      return n;
    },

    async ping() {},
  };
}
