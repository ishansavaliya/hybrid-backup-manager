import { serverEnv } from "../../../../lib/server/env";
import { clientIp, readJsonBody } from "../../../../lib/server/http";
import { submitLead } from "../../../../lib/server/leads";
import { createSmtpMailer, smtpEnv } from "../../../../lib/server/mailer";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Connect with Bakvion experts" enquiries from the website and the desktop app. */
export async function POST(req: Request) {
  try {
    const smtp = smtpEnv();
    const { status, body } = await submitLead(
      {
        repo: createSupabaseRepo(serverEnv()),
        mailer: smtp ? createSmtpMailer(smtp) : null,
        notifyTo: smtp?.leadsTo ?? null,
        adminUrl: process.env.PUBLIC_ADMIN_URL || undefined,
      },
      (await readJsonBody(req)) ?? null,
      { ip: clientIp(req), now: new Date() },
    );
    return Response.json(body, { status });
  } catch (err) {
    // Message only: never the request body or env values.
    console.error(
      "/api/v1/leads failed:",
      err instanceof Error ? err.message : typeof err,
    );
    return Response.json(
      {
        error: {
          code: "server_error",
          message: "Something went wrong. Please try again.",
        },
      },
      { status: 500 },
    );
  }
}
