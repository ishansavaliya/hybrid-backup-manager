import Link from "next/link";
import { Button } from "@bakvion/ui";
import { requireAdmin } from "../../../lib/server/admin-session";
import { logoutAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="stack">
      <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Link href="/bkpadmin">Clients</Link>
        <Link href="/bkpadmin/history">History</Link>
        <Link href="/bkpadmin/settings">Settings</Link>
        <form action={logoutAction}>
          <Button type="submit">Sign out</Button>
        </form>
      </nav>
      {children}
    </div>
  );
}
