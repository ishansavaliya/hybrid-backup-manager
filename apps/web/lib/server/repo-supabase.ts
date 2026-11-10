import { createClient } from "@supabase/supabase-js";
import type { ServerEnv } from "./env";
import {
  exactUsernameMatch,
  isLoginNameShape,
  UsernameTakenError,
  type AuditEntry,
  type ClientRecord,
  type ClientSummary,
  type DeviceMode,
  type DeviceRecord,
  type RegisterOutcome,
  type Repo,
} from "./repo";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const date = (v: unknown): Date => new Date(String(v));
const dateOrNull = (v: unknown): Date | null =>
  v ? new Date(String(v)) : null;

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action} failed: ${error.message}`);
}

function toClient(r: Row): ClientRecord {
  return {
    id: str(r.id),
    name: str(r.name),
    contactPerson: str(r.contact_person),
    phone: str(r.phone),
    notes: str(r.notes),
    expiresAt: date(r.expires_at),
    pcLimit: Number(r.pc_limit),
    blocked: Boolean(r.blocked),
    isTest: Boolean(r.is_test),
    createdAt: date(r.created_at),
  };
}

function toDevice(r: Row): DeviceRecord {
  return {
    id: str(r.id),
    clientId: str(r.client_id),
    installId: str(r.install_id),
    machineName: str(r.machine_name),
    windowsVersion: str(r.windows_version),
    appVersion: str(r.app_version),
    mode: r.mode as DeviceMode,
    firstSeenAt: date(r.first_seen_at),
    lastSeenAt: date(r.last_seen_at),
    removedAt: dateOrNull(r.removed_at),
  };
}

function one(v: unknown): Row | null {
  if (Array.isArray(v)) return (v[0] as Row | undefined) ?? null;
  return (v as Row | null) ?? null;
}

function toOutcome(rows: Row[] | null): RegisterOutcome {
  const r = rows?.[0];
  if (!r) throw new Error("Register failed: empty result");
  switch (r.outcome) {
    case "ok":
      return {
        outcome: "ok",
        clientId: str(r.client_id),
        deviceId: str(r.device_id),
        mode: r.mode as DeviceMode,
      };
    case "pc_limit":
      return { outcome: "pc_limit", pcLimit: Number(r.pc_limit) };
    case "code_invalid":
      return { outcome: "code_invalid" };
    case "client_missing":
      throw new Error("Client not found");
    default:
      throw new Error("Register failed: unknown outcome");
  }
}

export function createSupabaseRepo(env: ServerEnv): Repo {
  const db = createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const iso = (d: Date) => d.toISOString();

  return {
    async findLogin(username) {
      if (!isLoginNameShape(username)) return null;
      const { data, error } = await db
        .from("client_logins")
        .select("client_id, username, password_hash")
        .ilike("username", username.replace(/[\\%_]/g, "\\$&"))
        .limit(10);
      if (error) fail("findLogin", error);
      const r = exactUsernameMatch(
        (data ?? []).map((x) => ({ ...x, username: str(x.username) })),
        username,
      );
      return r
        ? { clientId: str(r.client_id), passwordHash: str(r.password_hash) }
        : null;
    },

    async getClient(id) {
      const { data, error } = await db
        .from("clients")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) fail("getClient", error);
      return data ? toClient(data) : null;
    },

    async registerDevice(clientId, d, tokenHash, now) {
      const { data, error } = await db.rpc("bkp_register_device", {
        p_client_id: clientId,
        p_install_id: d.installId,
        p_machine: d.machineName,
        p_windows: d.windowsVersion,
        p_app_version: d.appVersion,
        p_token_hash: tokenHash,
        p_now: iso(now),
      });
      if (error) fail("registerDevice", error);
      const rows = data as Row[] | null;
      const r = rows?.[0];
      if (r?.outcome === "ok") {
        return toOutcome([{ ...r, client_id: clientId }]);
      }
      return toOutcome(rows);
    },

    async signInWithCode(codeHmac, d, tokenHash, now) {
      const { data, error } = await db.rpc("bkp_sign_in_with_code", {
        p_code_hmac: codeHmac,
        p_install_id: d.installId,
        p_machine: d.machineName,
        p_windows: d.windowsVersion,
        p_app_version: d.appVersion,
        p_token_hash: tokenHash,
        p_now: iso(now),
      });
      if (error) fail("signInWithCode", error);
      return toOutcome(data as Row[] | null);
    },

    async deviceByToken(tokenHash) {
      const { data, error } = await db
        .from("device_tokens")
        .select("revoked_at, devices(*, clients(*))")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) fail("deviceByToken", error);
      if (!data || data.revoked_at) return null;
      const dev = one(data.devices);
      if (!dev || dev.removed_at) return null;
      const cl = one(dev.clients);
      if (!cl) return null;
      return { device: toDevice(dev), client: toClient(cl) };
    },

    async promoteDevice(deviceId, now) {
      const { data, error } = await db.rpc("bkp_promote_device", {
        p_device_id: deviceId,
        p_now: iso(now),
      });
      if (error) fail("promoteDevice", error);
      if (data === "full" || data === "restore_only" || data === "removed")
        return data;
      throw new Error("promoteDevice: unexpected result");
    },

    async touchDevice(deviceId, appVersion, now) {
      const { error } = await db
        .from("devices")
        .update({ app_version: appVersion, last_seen_at: iso(now) })
        .eq("id", deviceId);
      if (error) fail("touchDevice", error);
    },

    async revokeToken(tokenHash, now) {
      const { error } = await db
        .from("device_tokens")
        .update({ revoked_at: iso(now) })
        .eq("token_hash", tokenHash)
        .is("revoked_at", null);
      if (error) fail("revokeToken", error);
    },

    async rateLimited(key, max, windowSeconds, now) {
      const { data, error } = await db.rpc("bkp_rate_limited", {
        p_key: key,
        p_max: max,
        p_window_seconds: windowSeconds,
        p_now: iso(now),
      });
      if (error) fail("rateLimited", error);
      return data === true;
    },

    async recordFailure(key, windowSeconds, now) {
      const { error } = await db.rpc("bkp_record_failure", {
        p_key: key,
        p_window_seconds: windowSeconds,
        p_now: iso(now),
      });
      if (error) fail("recordFailure", error);
    },

    async audit(e) {
      const { error } = await db.from("audit_log").insert({
        actor: e.actor,
        action: e.action,
        client_id: e.clientId ?? null,
        device_id: e.deviceId ?? null,
        details: e.details ?? {},
        ip: e.ip ?? "",
      });
      if (error) fail("audit", error);
    },

    async listAudit({ clientId, limit }) {
      let q = db.from("audit_log").select("*");
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q
        .order("at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) fail("listAudit", error);
      return (data ?? []).map((r) => ({
        id: Number(r.id),
        at: date(r.at),
        actor: r.actor as AuditEntry["actor"],
        action: str(r.action),
        clientId: r.client_id ? str(r.client_id) : undefined,
        deviceId: r.device_id ? str(r.device_id) : undefined,
        details: (r.details ?? {}) as Record<string, unknown>,
        ip: str(r.ip),
      }));
    },

    async getSetting(key) {
      const { data, error } = await db
        .from("settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) fail("getSetting", error);
      return str(data?.value);
    },

    async setSetting(key, value) {
      const { error } = await db.from("settings").upsert({ key, value });
      if (error) fail("setSetting", error);
    },

    async listClients() {
      const { data, error } = await db
        .from("clients")
        .select(
          "*, client_logins(username), devices(mode, last_seen_at, removed_at)",
        )
        .order("created_at", { ascending: false });
      if (error) fail("listClients", error);
      return (data ?? []).map((r): ClientSummary => {
        const live = ((r.devices as Row[] | null) ?? []).filter(
          (d) => !d.removed_at,
        );
        let last: Date | null = null;
        for (const d of live) {
          const t = date(d.last_seen_at);
          if (!last || t > last) last = t;
        }
        const login = one(r.client_logins);
        return {
          ...toClient(r),
          username: login ? str(login.username) : null,
          pcsUsed: live.filter((d) => d.mode === "full").length,
          lastSeenAt: last,
        };
      });
    },

    async createClient(c) {
      const { data, error } = await db
        .from("clients")
        .insert({
          name: c.name,
          contact_person: c.contactPerson,
          phone: c.phone,
          notes: c.notes,
          expires_at: iso(c.expiresAt),
          pc_limit: c.pcLimit,
          blocked: c.blocked,
          is_test: c.isTest,
        })
        .select("id")
        .single();
      if (error) fail("createClient", error);
      return str(data.id);
    },

    async updateClient(id, patch) {
      const row: Row = { updated_at: iso(new Date()) };
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.contactPerson !== undefined)
        row.contact_person = patch.contactPerson;
      if (patch.phone !== undefined) row.phone = patch.phone;
      if (patch.notes !== undefined) row.notes = patch.notes;
      if (patch.expiresAt !== undefined) row.expires_at = iso(patch.expiresAt);
      if (patch.pcLimit !== undefined) row.pc_limit = patch.pcLimit;
      if (patch.blocked !== undefined) row.blocked = patch.blocked;
      if (patch.isTest !== undefined) row.is_test = patch.isTest;
      const { error } = await db.from("clients").update(row).eq("id", id);
      if (error) fail("updateClient", error);
    },

    async deleteClient(id) {
      const { error } = await db.from("clients").delete().eq("id", id);
      if (error) fail("deleteClient", error);
    },

    async setLogin(clientId, username, passwordHash) {
      const { error } = await db.from("client_logins").upsert(
        {
          client_id: clientId,
          username,
          password_hash: passwordHash,
          updated_at: iso(new Date()),
        },
        { onConflict: "client_id" },
      );
      if (error) {
        if (error.code === "23505") throw new UsernameTakenError();
        fail("setLogin", error);
      }
    },

    async createLoginCode(clientId, codeHmac, expiresAt) {
      const { error: delError } = await db
        .from("login_codes")
        .delete()
        .eq("code_hmac", codeHmac)
        .is("used_at", null)
        .lt("expires_at", iso(new Date()));
      if (delError) fail("createLoginCode", delError);
      const { error } = await db.from("login_codes").insert({
        client_id: clientId,
        code_hmac: codeHmac,
        expires_at: iso(expiresAt),
      });
      if (error) {
        if (error.code === "23505") return false;
        fail("createLoginCode", error);
      }
      return true;
    },

    async listDevices(clientId) {
      const { data, error } = await db
        .from("devices")
        .select("*")
        .eq("client_id", clientId)
        .order("last_seen_at", { ascending: false });
      if (error) fail("listDevices", error);
      return (data ?? []).map(toDevice);
    },

    async removeDevice(deviceId, now) {
      const { error } = await db
        .from("devices")
        .update({ removed_at: iso(now) })
        .eq("id", deviceId);
      if (error) fail("removeDevice", error);
      const { error: tokError } = await db
        .from("device_tokens")
        .update({ revoked_at: iso(now) })
        .eq("device_id", deviceId)
        .is("revoked_at", null);
      if (tokError) fail("removeDevice", tokError);
    },

    async pruneAudit(olderThan) {
      const { data, error } = await db
        .from("audit_log")
        .delete()
        .lt("at", iso(olderThan))
        .select("id");
      if (error) fail("pruneAudit", error);
      return data?.length ?? 0;
    },

    async pruneRateLimits(olderThan) {
      const { data, error } = await db
        .from("rate_limits")
        .delete()
        .lt("window_start", iso(olderThan))
        .select("key");
      if (error) fail("pruneRateLimits", error);
      return data?.length ?? 0;
    },

    async ping() {
      const { error } = await db.from("settings").select("key").limit(1);
      if (error) fail("ping", error);
    },
  };
}
