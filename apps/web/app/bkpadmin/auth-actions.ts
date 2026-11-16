"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_HOURS,
  checkAdminCredentials,
  createAdminSession,
} from "../../lib/server/admin-session";
import { serverEnv } from "../../lib/server/env";
import { createSupabaseRepo } from "../../lib/server/repo-supabase";

export interface LoginState {
  error: string | null;
}

async function requestIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const env = serverEnv();
  const repo = createSupabaseRepo(env);
  const now = new Date();
  const ip = await requestIp();

  if (await repo.rateLimited("admin:login", 5, 900, now)) {
    return { error: "Too many attempts. Try again in 15 minutes." };
  }

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!checkAdminCredentials(username, password, env)) {
    await repo.recordFailure("admin:login", 900, now);
    await repo.audit({ actor: "admin", action: "admin_login_failed", ip });
    return { error: "Wrong username or password" };
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, createAdminSession(env, now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
  await repo.audit({ actor: "admin", action: "admin_login", ip });
  redirect("/bkpadmin");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/bkpadmin/login");
}
