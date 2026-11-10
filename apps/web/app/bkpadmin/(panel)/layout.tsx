import { LogOut } from "lucide-react";
import { requireAdmin } from "../../../lib/server/admin-session";
import { serverEnv } from "../../../lib/server/env";
import { createSupabaseRepo } from "../../../lib/server/repo-supabase";
import { logoutAction } from "../auth-actions";
import { Button } from "../ui";
import { PanelShell } from "./PanelShell";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const env = serverEnv();
  const adminName = env.adminUsername;
  // The badge must never break the panel (e.g. before the leads table exists).
  const newLeads = await createSupabaseRepo(env)
    .countNewLeads()
    .catch(() => 0);
  return (
    <PanelShell
      adminName={adminName}
      newLeads={newLeads}
      signOut={
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="gx-signout"
            aria-label="Sign out"
          >
            <LogOut size={15} aria-hidden="true" />
            <span className="gx-signout__label">Sign out</span>
          </Button>
        </form>
      }
    >
      {children}
    </PanelShell>
  );
}
