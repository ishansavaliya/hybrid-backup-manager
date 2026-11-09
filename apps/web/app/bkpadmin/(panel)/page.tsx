import Link from "next/link";
import { Badge, Button, Card } from "@bakvion/ui";
import {
  filterClients,
  type ClientFilter,
} from "../../../lib/server/admin-service";
import { serverEnv } from "../../../lib/server/env";
import { daysLeft, membershipStatus } from "../../../lib/server/membership";
import { createSupabaseRepo } from "../../../lib/server/repo-supabase";
import { formatDate, formatDateTime, STATUS_TONE } from "./format";

export const dynamic = "force-dynamic";

const FILTERS: { key: ClientFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expiring", label: "Expiring" },
  { key: "expired", label: "Expired" },
  { key: "blocked", label: "Blocked" },
  { key: "test", label: "Test" },
];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const filter = FILTERS.some((f) => f.key === params.filter)
    ? (params.filter as ClientFilter)
    : "all";
  const now = new Date();
  const clients = filterClients(
    await createSupabaseRepo(serverEnv()).listClients(),
    q,
    filter,
    now,
  );
  return (
    <div className="stack">
      <div className="row spread">
        <h1>Clients</h1>
        <Link href="/bkpadmin/clients/new">
          <Button type="button">New client</Button>
        </Link>
      </div>
      <form className="row" method="get">
        <input
          className="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, phone or username"
          style={{ maxWidth: 320 }}
        />
        <input type="hidden" name="filter" value={filter} />
        <Button type="submit">Search</Button>
      </form>
      <div className="row">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/bkpadmin?${new URLSearchParams({ ...(q ? { q } : {}), filter: f.key })}`}
          >
            <Badge tone={f.key === filter ? "success" : "neutral"}>
              {f.label}
            </Badge>
          </Link>
        ))}
      </div>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Expires</th>
                <th>PCs</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const status = membershipStatus(c, now);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/bkpadmin/clients/${c.id}`}>{c.name}</Link>
                      {c.isTest ? <Badge>Test</Badge> : null}
                    </td>
                    <td>{c.phone}</td>
                    <td>
                      <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                    </td>
                    <td>
                      {formatDate(c.expiresAt)}
                      <div className="muted">
                        {daysLeft(c.expiresAt, now)} days left
                      </div>
                    </td>
                    <td>
                      {c.pcsUsed}/{c.pcLimit}
                    </td>
                    <td>
                      {c.lastSeenAt ? formatDateTime(c.lastSeenAt) : "Never"}
                    </td>
                  </tr>
                );
              })}
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No clients match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
