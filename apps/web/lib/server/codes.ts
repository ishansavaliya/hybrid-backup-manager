import { createHmac, randomInt } from "node:crypto";

export function generateLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function normalizeLoginCode(input: string): string | null {
  const stripped = input.replace(/\s+/g, "");
  return /^\d{6}$/.test(stripped) ? stripped : null;
}

export function hashLoginCode(code: string, sessionSecret: string): string {
  const key = createHmac("sha256", sessionSecret)
    .update("bakvion-login-code")
    .digest();
  return createHmac("sha256", key).update(code).digest("hex");
}
