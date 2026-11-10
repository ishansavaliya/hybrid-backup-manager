import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "../../../../../lib/server/admin-service";
import { serverEnv } from "../../../../../lib/server/env";
import {
  daysLeft,
  membershipStatus,
} from "../../../../../lib/server/membership";
import { createSupabaseRepo } from "../../../../../lib/server/repo-supabase";
import {
  blockAction,
  credentialsAction,
  extendAction,
  pcLimitAction,
  setExpiryAction,
  updateDetailsAction,
} from "../../../actions";
import {
  daysAgo,
  formatDate,
  formatDateTime,
  istDateInput,
} from "../../format";
import { actionInfo } from "../../event-labels";
import { CodeGenerator } from "./CodeGenerator";
import { DevicesCard, type DeviceRow } from "./DevicesCard";
import { requireAdmin } from "../../../../../lib/server/admin-session";
import {
  Button,
  Card,
  CardHeader,
  ConfirmForm,
  Field,
  Input,
  Notice,
  PageHeader,
  PasswordInput,
  StatusBadge,
  Stepper,
  Textarea,
} from "../../../ui";

export const dynamic = "force-dynamic";

function remaining(expiresAt: Date, now: Date): { big: string; small: string } {
  if (expiresAt.getTime() >= now.getTime()) {
    const n = daysLeft(expiresAt, now);
    return n <= 1
      ? { big: "Today", small: "ends tonight" }
      : { big: String(n), small: "days left" };
  }
  const n = Math.floor((now.getTime() - expiresAt.getTime()) / 86_400_000);
  return {
    big: String(Math.max(n, 0)),
    small: n === 1 ? "day expired" : "days expired",
  };
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { error, ok } = await searchParams;
  if (!isUuid(id)) notFound();
  const repo = createSupabaseRepo(serverEnv());
  const client = await repo.getClient(id);
  if (!client) notFound();
  const [devices, history, clients, lastRuns] = await Promise.all([
    repo.listDevices(id),
    repo.listAudit({ clientId: id, limit: 8 }),
    repo.listClients(),
    repo.lastReports(id),
  ]);
  const summary = clients.find((c) => c.id === id);
  const username = summary?.username ?? null;
  const now = new Date();
  const status = membershipStatus(client, now);
  const left = remaining(client.expiresAt, now);
  const deviceRows: DeviceRow[] = devices
    .filter((d) => d.removedAt === null)
    .map((d) => ({
      id: d.id,
      machineName: d.machineName,
      windowsVersion: d.windowsVersion,
      appVersion: d.appVersion,
      mode: d.mode,
      lastSeenAt: d.lastSeenAt.toISOString(),
      lastSeenLabel: daysAgo(d.lastSeenAt, now),
      lastBackup: lastRuns[d.id]
        ? {
            at: lastRuns[d.id]!.finishedAt.toISOString(),
            label: formatDateTime(lastRuns[d.id]!.finishedAt),
            state: lastRuns[d.id]!.state,
            plan: lastRuns[d.id]!.planName,
          }
        : null,
      reportEmails: d.reportEmails,
      reportMode: d.reportMode,
    }));
  const pcsUsed = deviceRows.filter((d) => d.mode === "full").length;

  return (
    <div className="gx-stack">
      <Notice ok={ok} error={error} />
      <PageHeader
        back={{ href: "/bkpadmin", label: "Clients" }}
        title={client.name}
        meta={<StatusBadge status={status} />}
        subtitle={`Membership ends ${formatDate(client.expiresAt)} · ${pcsUsed} of ${client.pcLimit} PCs in use`}
        actions={
          <>
            <ConfirmForm
              action={blockAction}
              fields={{ id, blocked: String(!client.blocked) }}
              trigger={client.blocked ? "Unblock" : "Block"}
              triggerVariant={client.blocked ? "secondary" : "danger"}
              title={
                client.blocked ? "Unblock this client?" : "Block this client?"
              }
              description={
                client.blocked
                  ? "Their PCs can back up again after their next sync."
                  : "New backups stop on all their PCs at the next sync. Restoring existing backups keeps working."
              }
              confirmLabel={client.blocked ? "Unblock" : "Block client"}
            />
          </>
        }
      />

      <div className="gx-detail-grid">
        <div className="gx-stack">
          <Card>
            <CardHeader title="Business details" />
            <form action={updateDetailsAction} className="gx-form">
              <input type="hidden" name="id" value={id} />
              <div className="gx-grid-2">
                <Field label="Business name" htmlFor="d-name" required>
                  <Input
                    id="d-name"
                    name="name"
                    defaultValue={client.name}
                    required
                    maxLength={200}
                  />
                </Field>
                <Field label="Contact person" htmlFor="d-contact">
                  <Input
                    id="d-contact"
                    name="contactPerson"
                    defaultValue={client.contactPerson}
                    maxLength={200}
                  />
                </Field>
                <Field label="Phone (WhatsApp)" htmlFor="d-phone">
                  <Input
                    id="d-phone"
                    name="phone"
                    type="tel"
                    defaultValue={client.phone}
                    maxLength={40}
                  />
                </Field>
                <Field label="Notes" htmlFor="d-notes">
                  <Textarea
                    id="d-notes"
                    name="notes"
                    rows={2}
                    defaultValue={client.notes}
                    maxLength={2000}
                  />
                </Field>
              </div>
              <div className="gx-form__actions">
                <Button type="submit">Save details</Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Sign-in"
              description="How the client signs in to the Bakvion app on their PC."
            />
            <form action={credentialsAction} className="gx-form">
              <input type="hidden" name="id" value={id} />
              <div className="gx-grid-2">
                <Field
                  label="Username"
                  htmlFor="s-user"
                  hint={username ? `Current: ${username}` : "Not set yet"}
                >
                  <Input
                    id="s-user"
                    name="username"
                    defaultValue={username ?? ""}
                    autoComplete="off"
                    required
                    minLength={3}
                    maxLength={64}
                    pattern="[A-Za-z0-9._\-]{3,64}"
                    aria-describedby="s-user-hint"
                  />
                </Field>
                <Field
                  label="New password"
                  htmlFor="s-pass"
                  hint="At least 8 characters."
                >
                  <PasswordInput
                    id="s-pass"
                    name="password"
                    minLength={8}
                    autoComplete="new-password"
                    required
                    aria-describedby="s-pass-hint"
                  />
                </Field>
              </div>
              <div className="gx-form__actions">
                <Button type="submit">
                  {username ? "Update login" : "Save login"}
                </Button>
              </div>
            </form>
            <hr className="gx-divider" />
            <CodeGenerator clientId={id} />
          </Card>

          <section
            className="gx-stack gx-stack--tight"
            aria-labelledby="pcs-title"
          >
            <div className="gx-section-head">
              <h2 id="pcs-title" className="gx-card-header__title">
                PCs
              </h2>
              <span className="gx-muted">
                {pcsUsed} of {client.pcLimit} slots used
              </span>
            </div>
            <DevicesCard clientId={id} devices={deviceRows} />
          </section>
        </div>

        <div className="gx-stack">
          <Card>
            <CardHeader
              title="Membership"
              description="Dates are in India time."
            />
            <div className="gx-countdown" data-status={status}>
              <span className="gx-countdown__big">{left.big}</span>
              <span className="gx-countdown__small">{left.small}</span>
              <span className="gx-countdown__date">
                Ends {formatDate(client.expiresAt)}
              </span>
            </div>
            <div className="gx-form">
              <div>
                <p className="gx-label gx-mb">Extend</p>
                <div className="gx-btn-group">
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
                      <Button type="submit" variant="secondary" size="sm">
                        {label}
                      </Button>
                    </form>
                  ))}
                </div>
              </div>
              <form action={setExpiryAction} className="gx-inline-form">
                <input type="hidden" name="id" value={id} />
                <Field label="Or set an exact end date" htmlFor="m-date">
                  <Input
                    id="m-date"
                    name="date"
                    type="date"
                    defaultValue={istDateInput(client.expiresAt)}
                    required
                  />
                </Field>
                <Button type="submit" variant="secondary">
                  Set date
                </Button>
              </form>
              <form action={pcLimitAction} className="gx-inline-form">
                <input type="hidden" name="id" value={id} />
                <Field label="PC limit" htmlFor="m-pcs">
                  <Stepper
                    id="m-pcs"
                    name="pcLimit"
                    defaultValue={client.pcLimit}
                  />
                </Field>
                <Button type="submit" variant="secondary">
                  Save
                </Button>
              </form>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recent activity"
              actions={
                <Link
                  href={`/bkpadmin/history?client=${id}`}
                  className="gx-link gx-small"
                >
                  See all
                </Link>
              }
            />
            {history.length ? (
              <ol className="gx-timeline">
                {history.map((r) => {
                  const info = actionInfo(r.action);
                  return (
                    <li key={r.id} className="gx-timeline__item">
                      <span
                        className={`gx-timeline__dot gx-timeline__dot--${info.tone}`}
                        aria-hidden="true"
                      />
                      <div className="gx-cell-main">
                        <span className="gx-strong">{info.label}</span>
                        <span className="gx-cell-sub">
                          {formatDateTime(r.at)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="gx-muted">Nothing yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
