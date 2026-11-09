import Link from "next/link";
import { Button, Card } from "@bakvion/ui";
import { serverEnv } from "../../../../lib/server/env";
import { createSupabaseRepo } from "../../../../lib/server/repo-supabase";
import { formatDateTime } from "../format";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  const repo = createSupabaseRepo(serverEnv());
  const [rows, clients] = await Promise.all([
    repo.listAudit({ clientId: client || undefined, limit: 200 }),
    repo.listClients(),
  ]);
  const names = new Map(clients.map((c) => [c.id, c.name]));
  return (
    <div className="stack">
      <h1>History</h1>
      <form className="row" method="get">
        <label className="field">
          Client
          <select name="client" defaultValue={client ?? ""}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Filter</Button>
      </form>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Client</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.at)}</td>
                  <td>{r.actor}</td>
                  <td>{r.action}</td>
                  <td>
                    {r.clientId ? (
                      <Link href={`/bkpadmin/clients/${r.clientId}`}>
                        {names.get(r.clientId) ?? r.clientId}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="muted">
                    {r.details && Object.keys(r.details).length > 0
                      ? JSON.stringify(r.details)
                      : ""}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No history yet.
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
