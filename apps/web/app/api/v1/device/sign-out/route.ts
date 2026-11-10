import { serverError, signOut } from "../../../../../lib/server/device-api";
import { serverEnv } from "../../../../../lib/server/env";
import { bearerToken, clientIp } from "../../../../../lib/server/http";
import { createSupabaseRepo } from "../../../../../lib/server/repo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { status, body } = await signOut(
      createSupabaseRepo(serverEnv()),
      bearerToken(req),
      {
        ip: clientIp(req),
        now: new Date(),
      },
    );
    return Response.json(body, { status });
  } catch (err) {
    // Message only: never the request body, tokens or env values.
    console.error(
      "/api/v1/device/sign-out failed:",
      err instanceof Error ? err.message : typeof err,
    );
    const { status, body } = serverError();
    return Response.json(body, { status });
  }
}
