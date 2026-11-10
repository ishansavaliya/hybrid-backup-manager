import { serverEnv } from "../../../../lib/server/env";
import { authorizeCron, runKeepalive } from "../../../../lib/server/keepalive";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const env = serverEnv();
    if (!authorizeCron(req.headers.get("authorization"), env.cronSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await runKeepalive(createSupabaseRepo(env), new Date());
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // Message only: never the request body, tokens or env values.
    console.error(
      "/api/cron/keepalive failed:",
      err instanceof Error ? err.message : typeof err,
    );
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
