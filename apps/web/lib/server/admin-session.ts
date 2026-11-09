import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv, type ServerEnv } from "./env";

export const ADMIN_COOKIE = "bkp_admin";
export const ADMIN_SESSION_HOURS = 12;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time compare of both fields; hashing first equalises lengths. */
export function checkAdminCredentials(
  username: string,
  password: string,
  env: ServerEnv,
): boolean {
  const userOk = timingSafeEqual(sha256(username), sha256(env.adminUsername));
  const passOk = timingSafeEqual(sha256(password), sha256(env.adminPassword));
  return userOk && passOk;
}

function sign(expiresMs: string, env: ServerEnv): string {
  return createHmac("sha256", env.sessionSecret)
    .update(`admin:${expiresMs}`)
    .digest("hex");
}

/** `<expiresMs>.<hex HMAC>`, valid for ADMIN_SESSION_HOURS. */
export function createAdminSession(env: ServerEnv, now: Date): string {
  const expiresMs = String(now.getTime() + ADMIN_SESSION_HOURS * 3_600_000);
  return `${expiresMs}.${sign(expiresMs, env)}`;
}

export function verifyAdminSession(
  value: string | undefined,
  env: ServerEnv,
  now: Date,
): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [expiresMs, mac] = parts;
  if (!/^\d+$/.test(expiresMs) || !/^[0-9a-f]{64}$/.test(mac)) return false;
  const expected = Buffer.from(sign(expiresMs, env), "hex");
  const given = Buffer.from(mac, "hex");
  if (!timingSafeEqual(expected, given)) return false;
  return Number(expiresMs) > now.getTime();
}

/** Server-only guard for panel pages and server actions. */
export async function requireAdmin(): Promise<void> {
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");
  const store = await cookies();
  if (
    !verifyAdminSession(store.get(ADMIN_COOKIE)?.value, serverEnv(), new Date())
  ) {
    redirect("/bkpadmin/login");
  }
}
