import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card } from "@bakvion/ui";
import { serverEnv } from "../../../../../lib/server/env";
import {
  daysLeft,
  membershipStatus,
} from "../../../../../lib/server/membership";
import { createSupabaseRepo } from "../../../../../lib/server/repo-supabase";
import {
  blockAction,
  credentialsAction,
  deleteClientAction,
  extendAction,
  pcLimitAction,
  setExpiryAction,
  updateDetailsAction,
} from "../../../actions";
import {
  formatDate,
  formatDateTime,
  istDateInput,
  STATUS_TONE,
} from "../../format";
import { CodeGenerator } from "./CodeGenerator";
import { DevicesCard } from "./DevicesCard";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  if (!UUID.test(id)) notFound();
  const repo = createSupabaseRepo(serverEnv());
  const client = await repo.getClient(id);
  if (!client) notFound();
  const [devices, history, clients] = await Promise.all([
    repo.listDevices(id),
    repo.listAudit({ clientId: id, limit: 20 }),
    repo.listClients(),
  ]);
  const username = clients.find((c) => c.id === id)?.username ?? null;
  const now = new Date();
  const status = membershipStatus(client, now);

  return (
    <div className="stack">
      <div className="row spread">
        <h1>
          {client.name} {client.isTest ? <Badge>Test</Badge> : null}
        </h1>
        <Badge tone={STATUS_TONE[status]}>{status}</Badge>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="notice">{ok}</div> : null}

      <Card className="stack">
        <h2>Details</h2>
        <form action={updateDetailsAction} className="stack">
          <input type="hidden" name="id" value={id} />
          <label className="field">
            Name
            <input name="name" defaultValue={client.name} required />
          </label>
          <label className="field">
            Contact person
            <input name="contactPerson" defaultValue={client.contactPerson} />
          </label>
          <label className="field">
            Phone
            <input name="phone" defaultValue={client.phone} />
          </label>
          <label className="field">
            Notes
            <textarea name="notes" defaultValue={client.notes} />
          </label>
          <label className="row">
            <input
              name="isTest"
              type="checkbox"
              defaultChecked={client.isTest}
            />{" "}
            Test client
          </label>
          <div>
            <Button type="submit">Save details</Button>
          </div>
        </form>
      </Card>

      <Card className="stack">
        <h2>Membership</h2>
        <p className="muted">
          Ends {formatDate(client.expiresAt)} ({daysLeft(client.expiresAt, now)}{" "}
          days left)
        </p>
        <form action={setExpiryAction} className="row">
          <input type="hidden" name="id" value={id} />
          <input
            name="date"
            type="date"
            defaultValue={istDateInput(client.expiresAt)}
            required
          />
          <Button type="submit">Set date</Button>
        </form>
        <div className="row">
          {(
            [
              [1, "+1 month"],
              [3, "+3 months"],
              [12, "+1 year"],
            ] as const
          ).map(([months, label]) => (
            <form key={months} action={extendAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="months" value={months} />
              <Button type="submit" className="secondary">
                {label}
              </Button>
            </form>
          ))}
        </div>
        <form action={pcLimitAction} className="row">
          <input type="hidden" name="id" value={id} />
          <label className="field">
            PC limit
            <input
              name="pcLimit"
              type="number"
              min={1}
              max={100}
              defaultValue={client.pcLimit}
              required
            />
          </label>
          <Button type="submit">Save limit</Button>
        </form>
      </Card>

      <Card className="stack">
        <h2>Sign-in</h2>
        <p className="muted">Username: {username ?? "not set"}</p>
        <form action={credentialsAction} className="stack">
          <input type="hidden" name="id" value={id} />
          <label className="field">
            Username
            <input
              name="username"
              defaultValue={username ?? ""}
              autoComplete="off"
              required
            />
          </label>
          <label className="field">
            New password (min 8 characters)
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
          <div>
            <Button type="submit">Save login</Button>
          </div>
        </form>
        <CodeGenerator clientId={id} />
      </Card>

      <DevicesCard clientId={id} devices={devices} now={now} />

      <Card className="row">
        <form action={blockAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="blocked" value={String(!client.blocked)} />
          <Button
            type="submit"
            className={client.blocked ? undefined : "danger"}
          >
            {client.blocked ? "Unblock" : "Block"}
          </Button>
        </form>
        {client.isTest ? (
          <form action={deleteClientAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" className="danger">
              Delete test client
            </Button>
          </form>
        ) : null}
      </Card>

      <Card className="stack">
        <div className="row spread">
          <h2>Recent history</h2>
          <Link href={`/bkpadmin/history?client=${id}`}>See all</Link>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.at)}</td>
                  <td>{r.actor}</td>
                  <td>{r.action}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td className="muted">No history yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
