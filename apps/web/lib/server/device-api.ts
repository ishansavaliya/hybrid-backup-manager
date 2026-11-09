import { hashLoginCode, normalizeLoginCode } from "./codes";
import type { ServerEnv } from "./env";
import { signLicense, type LicensePayload } from "./license";
import { membershipStatus } from "./membership";
import { verifyPassword } from "./passwords";
import {
  isLoginNameShape,
  type ClientRecord,
  type DeviceInfo,
  type DeviceMode,
  type Repo,
} from "./repo";
import { generateDeviceToken, hashToken } from "./tokens";

export type ApiResult = { status: number; body: unknown };
type Ctx = { ip: string; now: Date };

const WINDOW_SECONDS = 900;
const IP_PASSWORD_MAX = 10;
const USER_PASSWORD_MAX = 5;
const IP_CODE_MAX = 5;
const GLOBAL_CODE_MAX = 100;

const INSTALL_ID = /^[a-f0-9]{32}$/;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

// Well-formed scrypt hash of nothing anyone knows; verifying against it costs the same as a real hash.
const DUMMY_HASH = `scrypt$16384$8$1$${Buffer.alloc(16, 7).toString("base64")}$${Buffer.alloc(64, 9).toString("base64")}`;

function fail(status: number, code: string, message: string): ApiResult {
  return { status, body: { error: { code, message } } };
}

const badRequest = () => fail(400, "bad_request", "Invalid request.");
const rateLimitedResult = () =>
  fail(429, "rate_limited", "Too many attempts. Try again later.");
const invalidCredentials = () =>
  fail(401, "invalid_credentials", "Wrong username or password.");
const codeInvalid = () =>
  fail(401, "code_invalid", "This code is not valid or has expired.");
const unauthorized = () => fail(401, "unauthorized", "Sign in again.");
const deviceRemoved = () =>
  fail(401, "device_removed", "This PC was removed or signed out.");

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, min: number, max: number): string | null {
  return typeof v === "string" && v.length >= min && v.length <= max ? v : null;
}

function parseDevice(v: unknown): DeviceInfo | null {
  if (!isRecord(v)) return null;
  const installId =
    typeof v.installId === "string" && INSTALL_ID.test(v.installId)
      ? v.installId
      : null;
  const machineName = str(v.machineName, 0, 64);
  const windowsVersion = str(v.windowsVersion, 0, 64);
  const appVersion = str(v.appVersion, 0, 32);
  if (
    installId === null ||
    machineName === null ||
    windowsVersion === null ||
    appVersion === null
  ) {
    return null;
  }
  return { installId, machineName, windowsVersion, appVersion };
}

async function buildLicense(
  repo: Repo,
  env: ServerEnv,
  client: ClientRecord,
  deviceId: string,
  mode: DeviceMode,
  now: Date,
): Promise<string> {
  const payload: LicensePayload = {
    v: 1,
    clientId: client.id,
    clientName: client.name,
    deviceId,
    status: client.blocked ? "blocked" : "active",
    mode,
    expiresAt: client.expiresAt.toISOString(),
    issuedAt: now.toISOString(),
    renewContact: await repo.getSetting("renew_contact"),
  };
  return signLicense(payload, env.licensePrivateKey);
}

async function finishSignIn(
  repo: Repo,
  env: ServerEnv,
  outcome: Awaited<ReturnType<Repo["registerDevice"]>>,
  token: string,
  ctx: Ctx,
): Promise<ApiResult | null> {
  if (outcome.outcome !== "ok") return null;
  const client = await repo.getClient(outcome.clientId);
  if (!client) return null;
  const license = await buildLicense(
    repo,
    env,
    client,
    outcome.deviceId,
    outcome.mode,
    ctx.now,
  );
  return {
    status: 200,
    body: { deviceToken: token, license, mode: outcome.mode },
  };
}

async function signInPassword(
  repo: Repo,
  env: ServerEnv,
  username: string,
  password: string,
  device: DeviceInfo,
  ctx: Ctx,
): Promise<ApiResult> {
  const ipKey = `signin:ip:${ctx.ip}`;
  const userKey = `signin:user:${username.toLowerCase()}`;
  if (
    (await repo.rateLimited(ipKey, IP_PASSWORD_MAX, WINDOW_SECONDS, ctx.now)) ||
    (await repo.rateLimited(
      userKey,
      USER_PASSWORD_MAX,
      WINDOW_SECONDS,
      ctx.now,
    ))
  ) {
    return rateLimitedResult();
  }

  const login = isLoginNameShape(username)
    ? await repo.findLogin(username)
    : null;
  const passwordOk = await verifyPassword(
    password,
    login?.passwordHash ?? DUMMY_HASH,
  );
  if (!login || !passwordOk) {
    await repo.recordFailure(ipKey, WINDOW_SECONDS, ctx.now);
    await repo.recordFailure(userKey, WINDOW_SECONDS, ctx.now);
    await repo.audit({
      actor: "device",
      action: "sign_in_failed",
      clientId: login?.clientId,
      details: { method: "password", installId: device.installId },
      ip: ctx.ip,
    });
    return invalidCredentials();
  }

  const token = generateDeviceToken();
  const outcome = await repo.registerDevice(
    login.clientId,
    device,
    hashToken(token),
    ctx.now,
  );
  if (outcome.outcome === "pc_limit") return pcLimit(outcome.pcLimit);
  const result = await finishSignIn(repo, env, outcome, token, ctx);
  if (!result) return invalidCredentials();
  await repo.audit({
    actor: "device",
    action: "sign_in",
    clientId: login.clientId,
    deviceId: outcome.outcome === "ok" ? outcome.deviceId : undefined,
    details: { method: "password" },
    ip: ctx.ip,
  });
  return result;
}

function pcLimit(limit: number): ApiResult {
  return fail(
    409,
    "pc_limit",
    `PC limit reached (${limit}). Remove a PC from your account or contact support.`,
  );
}

async function signInCode(
  repo: Repo,
  env: ServerEnv,
  rawCode: string,
  device: DeviceInfo,
  ctx: Ctx,
): Promise<ApiResult> {
  const ipKey = `code:ip:${ctx.ip}`;
  const globalKey = "code:global";
  if (
    (await repo.rateLimited(ipKey, IP_CODE_MAX, WINDOW_SECONDS, ctx.now)) ||
    (await repo.rateLimited(
      globalKey,
      GLOBAL_CODE_MAX,
      WINDOW_SECONDS,
      ctx.now,
    ))
  ) {
    return rateLimitedResult();
  }

  const recordCodeFailure = async (): Promise<ApiResult> => {
    await repo.recordFailure(ipKey, WINDOW_SECONDS, ctx.now);
    await repo.recordFailure(globalKey, WINDOW_SECONDS, ctx.now);
    await repo.audit({
      actor: "device",
      action: "code_failed",
      details: { installId: device.installId },
      ip: ctx.ip,
    });
    return codeInvalid();
  };

  const code = normalizeLoginCode(rawCode);
  if (!code) return recordCodeFailure();

  const token = generateDeviceToken();
  const outcome = await repo.signInWithCode(
    hashLoginCode(code, env.sessionSecret),
    device,
    hashToken(token),
    ctx.now,
  );
  if (outcome.outcome === "code_invalid") return recordCodeFailure();
  if (outcome.outcome === "pc_limit") return pcLimit(outcome.pcLimit);
  const result = await finishSignIn(repo, env, outcome, token, ctx);
  if (!result) return recordCodeFailure();
  await repo.audit({
    actor: "device",
    action: "code_used",
    clientId: outcome.clientId,
    deviceId: outcome.deviceId,
    ip: ctx.ip,
  });
  return result;
}

export async function signIn(
  repo: Repo,
  env: ServerEnv,
  body: unknown,
  ctx: Ctx,
): Promise<ApiResult> {
  if (!isRecord(body)) return badRequest();
  const device = parseDevice(body.device);
  if (!device) return badRequest();

  if (body.method === "password") {
    const username = str(body.username, 1, 64);
    const password = str(body.password, 1, 256);
    if (username === null || password === null) return badRequest();
    return signInPassword(repo, env, username, password, device, ctx);
  }
  if (body.method === "code") {
    const code = str(body.code, 1, 32);
    if (code === null) return badRequest();
    return signInCode(repo, env, code, device, ctx);
  }
  return badRequest();
}

export async function refreshLicense(
  repo: Repo,
  env: ServerEnv,
  bearer: string | null,
  body: unknown,
  ctx: Ctx,
): Promise<ApiResult> {
  if (bearer === null || !TOKEN_SHAPE.test(bearer)) return unauthorized();
  if (!isRecord(body)) return badRequest();
  const appVersion = str(body.appVersion, 0, 32);
  if (appVersion === null) return badRequest();

  const found = await repo.deviceByToken(hashToken(bearer));
  if (!found) return deviceRemoved();
  await repo.touchDevice(found.device.id, appVersion, ctx.now);
  const status = membershipStatus(found.client, ctx.now);
  let mode = found.device.mode;
  if (mode === "restore_only" && status !== "expired" && status !== "blocked") {
    const promoted = await repo.promoteDevice(found.device.id, ctx.now);
    if (promoted === "removed") return deviceRemoved();
    mode = promoted;
  }
  const license = await buildLicense(
    repo,
    env,
    found.client,
    found.device.id,
    mode,
    ctx.now,
  );
  return { status: 200, body: { license, mode } };
}

export async function signOut(
  repo: Repo,
  bearer: string | null,
  ctx: Ctx,
): Promise<ApiResult> {
  if (bearer === null || !TOKEN_SHAPE.test(bearer)) return unauthorized();
  const tokenHash = hashToken(bearer);
  const found = await repo.deviceByToken(tokenHash);
  if (!found) return deviceRemoved();
  await repo.revokeToken(tokenHash, ctx.now);
  await repo.audit({
    actor: "device",
    action: "sign_out",
    clientId: found.client.id,
    deviceId: found.device.id,
    ip: ctx.ip,
  });
  return { status: 200, body: { ok: true } };
}

/** Internal failure shape for route handlers. */
export function serverError(): ApiResult {
  return fail(500, "server_error", "Something went wrong. Try again later.");
}
