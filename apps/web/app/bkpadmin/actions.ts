"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AdminInputError,
  createClientAccount,
  deleteTestClient,
  extendMembership,
  issueLoginCode,
  publicErrorMessage,
  removeClientDevice,
  setBlocked,
  setCredentials,
  setExpiryDate,
  setPcLimit,
  setRenewContact,
  updateClientDetails,
} from "../../lib/server/admin-service";
import { requireAdmin } from "../../lib/server/admin-session";
import { serverEnv } from "../../lib/server/env";
import { createSupabaseRepo } from "../../lib/server/repo-supabase";

export interface CodeState {
  error: string | null;
  code?: string;
  expiresAt?: string;
  whatsappText?: string;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function message(err: unknown): string {
  if (!(err instanceof AdminInputError)) {
    // Never log form values; the error itself may carry raw database text, so keep it server-side.
    console.error(
      "Admin action failed:",
      err instanceof Error ? err.name : typeof err,
    );
  }
  return publicErrorMessage(err);
}

function clientPath(
  id: string,
  query?: { error?: string; ok?: string },
): string {
  const q = new URLSearchParams(
    query as Record<string, string> | undefined,
  ).toString();
  return `/bkpadmin/clients/${encodeURIComponent(id)}${q ? `?${q}` : ""}`;
}

/** Runs a client mutation; failures come back to the page as ?error=, success as ?ok=. */
async function mutateClient(
  id: string,
  done: string,
  run: (repo: ReturnType<typeof createSupabaseRepo>) => Promise<void>,
): Promise<never> {
  await requireAdmin();
  let target: string;
  try {
    await run(createSupabaseRepo(serverEnv()));
    revalidatePath("/bkpadmin", "layout");
    target = clientPath(id, { ok: done });
  } catch (err) {
    target = clientPath(id, { error: message(err) });
  }
  redirect(target);
}

export interface FormState {
  error: string | null;
}

/** New-client dialog: errors stay in the dialog; success opens the client page. */
export async function createClientFormAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  let id: string;
  try {
    id = await createClientAccount(
      createSupabaseRepo(serverEnv()),
      {
        name: text(formData, "name"),
        contactPerson: text(formData, "contactPerson"),
        phone: text(formData, "phone"),
        notes: text(formData, "notes"),
        expiresOn: text(formData, "expiresOn"),
        pcLimit: Number(text(formData, "pcLimit")),
        isTest: formData.get("isTest") === "on",
      },
      new Date(),
    );
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/bkpadmin", "layout");
  redirect(clientPath(id, { ok: "Client created" }));
}

export async function updateDetailsAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  await mutateClient(id, "Details saved", (repo) =>
    updateClientDetails(repo, id, {
      name: text(formData, "name"),
      contactPerson: text(formData, "contactPerson"),
      phone: text(formData, "phone"),
      notes: text(formData, "notes"),
      isTest: formData.get("isTest") === "on",
    }),
  );
}

export async function setExpiryAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  await mutateClient(id, "Expiry date saved", (repo) =>
    setExpiryDate(repo, id, text(formData, "date")),
  );
}

export async function extendAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const months = Number(text(formData, "months"));
  await mutateClient(id, "Membership extended", async (repo) => {
    if (months !== 1 && months !== 3 && months !== 12) {
      throw new Error("Months must be 1, 3 or 12");
    }
    await extendMembership(repo, id, months, new Date());
  });
}

export async function pcLimitAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  await mutateClient(id, "PC limit saved", (repo) =>
    setPcLimit(repo, id, Number(text(formData, "pcLimit"))),
  );
}

export async function credentialsAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  await mutateClient(id, "Login saved", (repo) =>
    setCredentials(
      repo,
      id,
      text(formData, "username"),
      text(formData, "password"),
    ),
  );
}

export async function blockAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const blocked = text(formData, "blocked") === "true";
  await mutateClient(
    id,
    blocked ? "Client blocked" : "Client unblocked",
    (repo) => setBlocked(repo, id, blocked),
  );
}

export async function removeDeviceAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  await mutateClient(id, "PC removed", (repo) =>
    removeClientDevice(repo, text(formData, "deviceId"), new Date(), id),
  );
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = text(formData, "id");
  let target = "/bkpadmin";
  try {
    await deleteTestClient(createSupabaseRepo(serverEnv()), id);
    revalidatePath("/bkpadmin", "layout");
  } catch (err) {
    target = clientPath(id, { error: message(err) });
  }
  redirect(target);
}

export async function issueCodeAction(
  _prev: CodeState,
  formData: FormData,
): Promise<CodeState> {
  await requireAdmin();
  try {
    const env = serverEnv();
    const r = await issueLoginCode(
      createSupabaseRepo(env),
      env,
      text(formData, "id"),
      new Date(),
    );
    revalidatePath("/bkpadmin", "layout");
    return {
      error: null,
      code: r.code,
      expiresAt: r.expiresAt.toISOString(),
      whatsappText: r.whatsappText,
    };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function renewContactAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let target: string;
  try {
    await setRenewContact(
      createSupabaseRepo(serverEnv()),
      text(formData, "text"),
    );
    target = "/bkpadmin/settings?ok=Saved";
  } catch (err) {
    target = `/bkpadmin/settings?${new URLSearchParams({ error: message(err) })}`;
  }
  redirect(target);
}
