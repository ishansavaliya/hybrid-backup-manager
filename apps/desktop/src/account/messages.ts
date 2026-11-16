import type { AppText } from "../i18n";

export interface AppError {
  code: string;
  message: string;
}

/** Turns an agent/service error into text in the chosen language. */
export function errorText(t: AppText, e: AppError | null): string {
  if (!e) return "";
  if (e.code === "NO_RUNTIME") return t.disconnected.runtime;
  // PC_LIMIT text comes from the server ("Your plan allows N PCs. ...").
  if (e.code === "PC_LIMIT") {
    const text = e.message.trim();
    if (text !== "" && text.toUpperCase() !== e.code) return text;
  }
  const known = (t.errors as Record<string, string>)[e.code];
  return known ?? e.message;
}

export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "code" in e && "message" in e)
    return {
      code: String((e as { code: unknown }).code),
      message: String((e as { message: unknown }).message),
    };
  return { code: "", message: e instanceof Error ? e.message : String(e) };
}
