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
import { NewClientDialog } from "./NewClientDialog";

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
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const { filter } = await searchParams;
  const initialFilter: ClientFilterKey = FILTER_KEYS.includes(
    filter as ClientFilter,
  )
    ? (filter as ClientFilterKey)
    : "all";
  const now = new Date();
  const list = await createSupabaseRepo(serverEnv()).listClients();
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
            <NewClientDialog />
          </Suspense>
        }
      />
      <ClientsTable rows={rows} initialFilter={initialFilter} />
    </div>
  );
}
