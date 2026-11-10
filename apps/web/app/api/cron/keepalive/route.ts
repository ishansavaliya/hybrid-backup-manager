import { serverEnv } from "../../../../lib/server/env";
import { authorizeCron, runKeepalive } from "../../../../lib/server/keepalive";
import { createSmtpMailer, smtpEnv } from "../../../../lib/server/mailer";
import { runReportDigest } from "../../../../lib/server/reports";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const env = serverEnv();
    if (!authorizeCron(req.headers.get("authorization"), env.cronSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const repo = createSupabaseRepo(env);
    const now = new Date();
    const result = await runKeepalive(repo, now);
    // Runs at 03:00 UTC (08:30 IST): the daily summary for hourly plans.
    const smtp = smtpEnv();
    const digest = await runReportDigest(
      { repo, mailer: smtp ? createSmtpMailer(smtp) : null },
      now,
    );
    return Response.json({ ok: true, ...result, ...digest });
  } catch (err) {
    // Message only: never the request body, tokens or env values.
    console.error(
      "/api/cron/keepalive failed:",
      err instanceof Error ? err.message : typeof err,
    );
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
