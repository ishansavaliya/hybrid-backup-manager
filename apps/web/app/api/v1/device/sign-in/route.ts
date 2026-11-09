import { signIn, serverError } from "../../../../../lib/server/device-api";
import { serverEnv } from "../../../../../lib/server/env";
import { clientIp, readJsonBody } from "../../../../../lib/server/http";
import { createSupabaseRepo } from "../../../../../lib/server/repo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const env = serverEnv();
    const body = await readJsonBody(req);
    const { status, body: out } = await signIn(
      createSupabaseRepo(env),
      env,
      body ?? null,
      {
        ip: clientIp(req),
        now: new Date(),
      },
    );
    return Response.json(out, { status });
  } catch {
    const { status, body } = serverError();
    return Response.json(body, { status });
  }
}
