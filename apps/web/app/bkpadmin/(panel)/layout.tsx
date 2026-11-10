import { LogOut } from "lucide-react";
import { requireAdmin } from "../../../lib/server/admin-session";
import { serverEnv } from "../../../lib/server/env";
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
  const adminName = serverEnv().adminUsername;
  return (
    <PanelShell
      adminName={adminName}
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
