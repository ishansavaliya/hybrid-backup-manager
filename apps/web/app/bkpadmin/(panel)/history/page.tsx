import { isUuid } from "../../../../lib/server/admin-service";
import { serverEnv } from "../../../../lib/server/env";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";
import { requireAdmin } from "../../../../lib/server/admin-session";
import { daysAgo, formatDateTime } from "../format";
import { PageHeader } from "../../ui";
import { HistoryTable, type HistoryRow } from "./HistoryTable";

export const dynamic = "force-dynamic";

/** Small, readable key/value pairs for the details column (never raw JSON). */
function detailPairs(
  details: Record<string, unknown> | undefined,
): [string, string][] {
  if (!details) return [];
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 4)
    .map(([k, v]) => {
      const key = k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
      const value =
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)
          ? formatDateTime(new Date(v))
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
      return [key, value.length > 60 ? `${value.slice(0, 57)}…` : value];
    });
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireAdmin();
  const { client: rawClient } = await searchParams;
  // Ignore anything that is not a client id (e.g. a hand-edited URL).
  const client =
    typeof rawClient === "string" && isUuid(rawClient) ? rawClient : null;
  const repo = createSupabaseRepo(serverEnv());
  const [audit, clients] = await Promise.all([
    repo.listAudit({ clientId: client ?? undefined, limit: 200 }),
    repo.listClients(),
  ]);
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const now = new Date();
  const rows: HistoryRow[] = audit.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    atLabel: formatDateTime(r.at),
    atRelative: daysAgo(r.at, now),
    actor: r.actor,
    action: r.action,
    clientId: r.clientId ?? null,
    clientName: r.clientId ? (names.get(r.clientId) ?? null) : null,
    ip: r.ip ?? "",
    details: detailPairs(r.details),
  }));

  return (
    <div className="gx-stack">
      <PageHeader
        title="History"
        subtitle="Sign-ins, codes and every change you make — latest 200 events."
      />
      <HistoryTable
        rows={rows}
        clients={clients
          .map((c) => ({ id: c.id, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        client={client}
      />
    </div>
  );
}
