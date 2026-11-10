import { Suspense } from "react";
import {
  filterClients,
  type ClientFilter,
} from "../../../lib/server/admin-service";
import { serverEnv } from "../../../lib/server/env";
import { daysLeft, membershipStatus } from "../../../lib/server/membership";
import { createSupabaseRepo } from "../../../lib/server/repo-supabase";
import { requireAdmin } from "../../../lib/server/admin-session";
import { daysAgo, formatDate } from "./format";
import { PageHeader } from "../ui";
import {
  ClientsTable,
  type ClientFilterKey,
  type ClientRow,
} from "./ClientsTable";
import { NewClientDialog, type ClientPrefill } from "./NewClientDialog";
import { isUuid } from "../../../lib/server/admin-service";

export const dynamic = "force-dynamic";

const FILTER_KEYS: ClientFilter[] = ["expiring", "expired", "blocked"];

function expiresHint(expiresAt: Date, now: Date): string {
  const left = daysLeft(expiresAt, now);
  if (expiresAt.getTime() >= now.getTime()) {
    if (left <= 1) return "Ends today";
    return `${left} days left`;
  }
  const ago = Math.floor((now.getTime() - expiresAt.getTime()) / 86_400_000);
  return ago <= 0
    ? "Expired today"
    : ago === 1
      ? "Expired 1 day ago"
      : `Expired ${ago} days ago`;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; lead?: string }>;
}) {
  await requireAdmin();
  const { filter, lead: leadParam } = await searchParams;
  const initialFilter: ClientFilterKey = FILTER_KEYS.includes(
    filter as ClientFilter,
  )
    ? (filter as ClientFilterKey)
    : "all";
  const now = new Date();
  const repo = createSupabaseRepo(serverEnv());
  const list = await repo.listClients();
  let prefill: ClientPrefill | undefined;
  if (leadParam && isUuid(leadParam)) {
    const lead = await repo.getLead(leadParam).catch(() => null);
    if (lead && !lead.clientId)
      prefill = {
        leadId: lead.id,
        name: lead.business,
        contactPerson: lead.name,
        phone: lead.phone,
        notes: [
          lead.city && `City: ${lead.city}`,
          lead.pcs && `PCs wanted: ${lead.pcs}`,
          lead.email && `Email: ${lead.email}`,
          lead.message,
        ]
          .filter(Boolean)
          .join("\n"),
      };
  }
  const membership = new Map(
    FILTER_KEYS.map((k) => [
      k,
      new Set(filterClients(list, "", k, now).map((c) => c.id)),
    ]),
  );
  const rows: ClientRow[] = list.map((c) => ({
    id: c.id,
    name: c.name,
    contactPerson: c.contactPerson,
    phone: c.phone,
    username: c.username ?? "",
    status: membershipStatus(c, now),
    expiresAt: c.expiresAt.toISOString(),
    expiresLabel: formatDate(c.expiresAt),
    expiresHint: expiresHint(c.expiresAt, now),
    pcsUsed: c.pcsUsed,
    pcLimit: c.pcLimit,
    lastSeenAt: c.lastSeenAt ? c.lastSeenAt.toISOString() : null,
    lastSeenLabel: c.lastSeenAt ? daysAgo(c.lastSeenAt, now) : "Never",
    filters: FILTER_KEYS.filter((k) =>
      membership.get(k)?.has(c.id),
    ) as ClientFilterKey[],
  }));

  return (
    <div className="gx-stack">
      <PageHeader
        title="Clients"
        subtitle="Businesses using Bakvion, their membership and PCs."
        actions={
          <Suspense>
            <NewClientDialog prefill={prefill} />
          </Suspense>
        }
      />
      <ClientsTable rows={rows} initialFilter={initialFilter} />
    </div>
  );
}
