import { requireAdmin } from "../../../../lib/server/admin-session";
import { serverEnv } from "../../../../lib/server/env";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";
import { daysAgo, formatDateTime } from "../format";
import { EmptyState, PageHeader } from "../../ui";
import { LeadsTable, type LeadRow } from "./LeadsTable";

export const dynamic = "force-dynamic";

/** wa.me wants digits with country code; assume India for 10-digit numbers. */
function whatsappDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

export default async function LeadsPage() {
  await requireAdmin();
  let leads;
  try {
    leads = await createSupabaseRepo(serverEnv()).listLeads(500);
  } catch {
    return (
      <div className="gx-stack">
        <PageHeader title="Leads" />
        <div className="gx-table-card">
          <EmptyState
            title="Leads aren't set up yet"
            description="Run supabase/migrations/202611100002_leads.sql in the Supabase SQL editor, then reload this page."
          />
        </div>
      </div>
    );
  }
  const now = new Date();
  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    createdLabel: formatDateTime(l.createdAt),
    createdRelative: daysAgo(l.createdAt, now),
    name: l.name,
    business: l.business,
    phone: l.phone,
    whatsapp: whatsappDigits(l.phone),
    email: l.email,
    city: l.city,
    pcs: l.pcs,
    message: l.message,
    source: l.source,
    status: l.status,
    emailSent: l.emailSent,
    clientId: l.clientId,
  }));
  const fresh = rows.filter((r) => r.status === "new").length;
  return (
    <div className="gx-stack">
      <PageHeader
        title="Leads"
        subtitle={
          fresh
            ? `${fresh} new ${fresh === 1 ? "enquiry" : "enquiries"} — contact them within 24 hours.`
            : "Enquiries from “Connect with Bakvion experts” on the website and in the app."
        }
      />
      <LeadsTable rows={rows} />
    </div>
  );
}
