import { MAX_RENEW_CONTACT } from "../../../../lib/server/admin-service";
import { serverEnv } from "../../../../lib/server/env";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";
import { renewContactAction } from "../../actions";
import { requireAdmin } from "../../../../lib/server/admin-session";
import {
  Button,
  Card,
  CardHeader,
  CountedTextarea,
  Field,
  Notice,
  PageHeader,
} from "../../ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireAdmin();
  const { error, ok } = await searchParams;
  const current =
    await createSupabaseRepo(serverEnv()).getSetting("renew_contact");
  return (
    <div className="gx-stack">
      <Notice ok={ok} error={error} />
      <PageHeader
        title="Settings"
        subtitle="Settings that apply to every client."
      />
      <div className="gx-settings-grid">
        <Card>
          <CardHeader
            title="Renewal message"
            description="Clients see this inside the Bakvion app when their membership is about to end or has ended. Tell them how to renew — for example your WhatsApp number."
          />
          <form action={renewContactAction} className="gx-form">
            <Field
              label="Message shown to clients"
              htmlFor="renew-text"
              hint="Leave empty to show only “Contact your Bakvion provider”."
            >
              <CountedTextarea
                id="renew-text"
                name="text"
                rows={4}
                defaultValue={current}
                maxLength={MAX_RENEW_CONTACT}
                aria-describedby="renew-text-hint"
                placeholder="To renew Bakvion, WhatsApp us on +91 … or call between 10 am and 7 pm."
              />
            </Field>
            <div className="gx-form__actions">
              <Button type="submit">Save message</Button>
            </div>
          </form>
        </Card>
        <Card>
          <CardHeader
            title="Where clients see it"
            description="A preview of the notice in the Bakvion app."
          />
          <div className="gx-preview">
            <p className="gx-preview__title">Your membership has expired.</p>
            <p className="gx-preview__body">
              {current || "Contact your Bakvion provider to renew."}
            </p>
            <p className="gx-hint">
              Backups pause; restoring old backups keeps working.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
