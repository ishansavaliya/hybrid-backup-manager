import { Button, Card } from "@bakvion/ui";
import { MAX_RENEW_CONTACT } from "../../../../lib/server/admin-service";
import { serverEnv } from "../../../../lib/server/env";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";
import { renewContactAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const current =
    await createSupabaseRepo(serverEnv()).getSetting("renew_contact");
  return (
    <div className="stack">
      <h1>Settings</h1>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="notice">{ok}</div> : null}
      <Card>
        <form action={renewContactAction} className="stack">
          <label className="field">
            Renew contact (shown to clients when their membership expires)
            <textarea
              name="text"
              defaultValue={current}
              maxLength={MAX_RENEW_CONTACT}
            />
          </label>
          <div>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
