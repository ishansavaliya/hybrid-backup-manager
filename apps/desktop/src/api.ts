import type { AgentResponse } from "@bakvion/shared-types";
export class AgentRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentRequestError";
    this.code = code;
  }
}
export async function request<T>(method: string, params?: unknown): Promise<T> {
  if (!("__TAURI_INTERNALS__" in window))
    throw new AgentRequestError(
      "NO_RUNTIME",
      "Windows desktop runtime required. This browser view has no access to the backup service.",
    );
  const { invoke } = await import("@tauri-apps/api/core");
  const response = await invoke<AgentResponse<T>>("agent_request", {
    request: { version: 1, method, params },
  });
  if (response.error)
    throw new AgentRequestError(response.error.code, response.error.message);
  if (response.result === undefined)
    throw new Error("Agent returned no result");
  return response.result;
}
export async function choose(directory: boolean): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in window))
    throw new Error(
      "Native selection requires the Windows desktop application.",
    );
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory, multiple: false });
  return typeof result === "string" ? result : null;
}
