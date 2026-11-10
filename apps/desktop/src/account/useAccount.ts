import { useCallback, useEffect, useState } from "react";
import type { AccountStatus, SignInParams } from "@bakvion/shared-types";
import { AgentRequestError, request } from "../api";
import { errorMessage } from "./messages";

const POLL_MS = 60_000;
function describe(e: unknown): string {
  if (e instanceof AgentRequestError) return errorMessage(e.code, e.message);
  return e instanceof Error ? e.message : String(e);
}
export function useAccount() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setStatus(await request<AccountStatus>("accountStatus"));
    } catch {
      // Service unreachable: App keeps its disconnected-service behaviour.
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);
  async function run(method: string, params?: unknown): Promise<boolean> {
    setError("");
    try {
      const result = await request<AccountStatus | true>(method, params);
      if (typeof result === "object") setStatus(result);
      else await reload();
      return true;
    } catch (e) {
      setError(describe(e));
      return false;
    }
  }
  return {
    status,
    loading,
    error,
    reload,
    signIn: (p: SignInParams) => run("signIn", p),
    signOut: () => run("signOut"),
    syncNow: () => run("refreshLicense"),
  };
}
export type Account = ReturnType<typeof useAccount>;
