import { redirect } from "next/navigation";
import { requireAdmin } from "../../../../../lib/server/admin-session";

export const dynamic = "force-dynamic";

/** New clients are created in a dialog on the Clients page. */
export default async function NewClientPage() {
  await requireAdmin();
  redirect("/bkpadmin?new=1");
}
