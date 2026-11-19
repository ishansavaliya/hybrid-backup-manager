import { serverError } from "../../../../../lib/server/device-api";
import { serverEnv } from "../../../../../lib/server/env";
import { bearerToken, readJsonBody } from "../../../../../lib/server/http";
import { createSmtpMailer, smtpEnv } from "../../../../../lib/server/mailer";
import { submitReports } from "../../../../../lib/server/reports";
import { createSupabaseRepo } from "../../../../../lib/server/repo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Finished backup runs and email-report settings from a signed-in PC. */
export async function POST(req: Request) {
  try {
    const smtp = smtpEnv();
    const adminAlertEmail = (
      process.env.ADMIN_ALERT_EMAIL ||
      process.env.LEAD_NOTIFY_EMAIL ||
      "ishansavaliya787@gmail.com"
    ).trim();
    const { status, body } = await submitReports(
      {
        repo: createSupabaseRepo(serverEnv()),
        mailer: smtp ? createSmtpMailer(smtp) : null,
        adminAlertEmail,
      },
      bearerToken(req),
      (await readJsonBody(req)) ?? null,
      { now: new Date() },
    );
    return Response.json(body, { status });
  } catch (err) {
    // Message only: never the request body, tokens or env values.
    console.error(
      "/api/v1/device/reports failed:",
      err instanceof Error ? err.message : typeof err,
    );
    const { status, body } = serverError();
    return Response.json(body, { status });
  }
}
