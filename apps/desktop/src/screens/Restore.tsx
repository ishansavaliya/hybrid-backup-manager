import { useState } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  FolderOpen,
  FolderSearch,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Plan, Snapshot, SnapshotNode } from "@bakvion/shared-types";
import { GxDialog, GxSelect } from "@bakvion/ui/gx";
import { choose, request } from "../api";
import { DatePicker, localDay } from "../DatePicker";
import { format, useI18n } from "../i18n";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PasswordInput,
} from "../ui";

export function Restore({
  plans,
  busy,
  act,
  notify,
}: {
  plans: Plan[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  notify: (v: string) => void;
}) {
  const { t, dateTime } = useI18n();
  const r = t.restore;
  const [planId, setPlan] = useState("");
  const [destinationId, setDestination] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState("");
  const [nodes, setNodes] = useState<SnapshotNode[]>([]);
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const [pending, setPending] = useState<{
    selection: string;
    target: string;
  } | null>(null);
  const [opening, setOpening] = useState<{
    name: string;
    folder: string;
    key: string;
  } | null>(null);
  const plan = plans.find((p) => p.id === planId);
  const params = { planId, destinationId };

  async function pickTarget(selection = "") {
    const parent = await choose(true);
    if (!parent) return;
    const target =
      parent.replace(/[\\/]$/, "") +
      (parent.includes("\\") ? "\\" : "/") +
      `Bakvion-Restore-${Date.now()}`;
    setPending({ selection, target });
  }
  async function runRestore(selection: string, target: string) {
    const result = await request<{ verifiedFiles: number }>("restore", {
      ...params,
      snapshotId: selected,
      target,
      selection,
    });
    notify(format(r.done, { n: result.verifiedFiles, target }));
  }

  // Calendar days in this PC's time zone (a 1:00 AM IST backup is that day).
  const backupDays = new Set(snapshots.map((s) => localDay(s.time)));
  const shown = snapshots.filter((s) => !day || localDay(s.time) === day);
  return (
    <div className="gx-stack">
      <Card>
        <CardHeader
          title={r.findTitle}
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                setOpening({ name: r.openNameDefault, folder: "", key: "" })
              }
            >
              <FolderSearch size={14} aria-hidden="true" />
              {r.openOther}
            </Button>
          }
        />
        <div className="gx-filters">
          <Field label={r.plan} htmlFor="rs-plan">
            <GxSelect
              id="rs-plan"
              ariaLabel={r.plan}
              value={planId}
              placeholder={r.planPlaceholder}
              options={plans.map((p) => ({ value: p.id, label: p.name }))}
              onValueChange={(v) => {
                setPlan(v);
                setDestination("");
                setSnapshots([]);
                setNodes([]);
                setSelected("");
              }}
            />
          </Field>
          <Field label={r.destination} htmlFor="rs-dest">
            <GxSelect
              id="rs-dest"
              ariaLabel={r.destination}
              value={destinationId}
              placeholder={r.destinationPlaceholder}
              disabled={!plan}
              options={(plan?.destinations ?? []).map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              onValueChange={(v) => {
                setDestination(v);
                setSnapshots([]);
                setNodes([]);
                setSelected("");
              }}
            />
          </Field>
          <Button
            disabled={!destinationId || busy}
            onClick={() =>
              void act(async () => {
                setSnapshots(await request<Snapshot[]>("snapshots", params));
                setNodes([]);
                setSelected("");
              })
            }
          >
            <Search size={15} aria-hidden="true" />
            {r.find}
          </Button>
          <Field label={r.date} htmlFor="rs-day">
            <DatePicker
              id="rs-day"
              value={day}
              onChange={setDay}
              marked={backupDays}
              disabled={!snapshots.length}
            />
          </Field>
        </div>
      </Card>

      <div className="gx-two">
        <Card>
          <CardHeader title={r.listTitle} />
          {shown.length ? (
            <div className="gx-list">
              {shown.map((s) => (
                <div
                  className="gx-row"
                  key={s.id}
                  data-selected={s.id === selected || undefined}
                >
                  <div className="gx-row__main">
                    <span className="gx-row__title">{dateTime(s.time)}</span>
                    <span className="gx-path">{s.id.slice(0, 12)}</span>
                  </div>
                  <Button
                    variant={s.id === selected ? "primary" : "secondary"}
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        setNodes(
                          await request<SnapshotNode[]>("browse", {
                            ...params,
                            snapshotId: s.id,
                          }),
                        );
                        setSelected(s.id);
                      })
                    }
                  >
                    {r.browse}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<CalendarDays size={20} />} title={r.emptyTitle}>
              {r.emptyBody}
            </EmptyState>
          )}
        </Card>
        <Card>
          <CardHeader title={r.safeTitle} description={r.safeBody} />
          <Button
            disabled={!selected || busy}
            onClick={() => void pickTarget()}
          >
            <ArrowDownToLine size={15} aria-hidden="true" />
            {r.restoreAll}
          </Button>
          <p
            className="gx-hint"
            style={{ marginTop: 12, display: "flex", gap: 6 }}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            {t.footer}
          </p>
        </Card>
      </div>

      {selected ? (
        <Card flush>
          <div className="gx-table-toolbar">
            <strong>{r.filesTitle}</strong>
            <label className="gx-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label={r.search}
                placeholder={r.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="gx-table-scroll">
            <table className="gx-table">
              <thead>
                <tr>
                  <th scope="col">{r.path}</th>
                  <th scope="col">{r.type}</th>
                  <th scope="col">{r.size}</th>
                  <th scope="col">
                    <span className="gx-sr-only">{r.restoreOne}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {nodes
                  .filter((n) =>
                    n.path.toLowerCase().includes(search.toLowerCase()),
                  )
                  .slice(0, 500)
                  .map((n) => (
                    <tr key={n.path}>
                      <td>
                        <span className="gx-path" title={n.path}>
                          {n.path}
                        </span>
                      </td>
                      <td>{n.type}</td>
                      <td className="gx-tabular">
                        {n.type === "file"
                          ? (n.size ?? 0).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={
                            busy ||
                            !["file", "dir"].includes(n.type) ||
                            n.path === "/"
                          }
                          onClick={() => void pickTarget(n.path)}
                        >
                          {r.restoreOne}
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="gx-table-foot">
            <span className="gx-muted">{r.limit}</span>
          </div>
        </Card>
      ) : null}

      <GxDialog
        open={!!opening}
        onOpenChange={(o) => !o && setOpening(null)}
        title={r.openOther}
        description={r.openBody}
        closeLabel={t.common.close}
        width={540}
      >
        {opening ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const o = opening;
              setOpening(null);
              void act(async () => {
                const p = await request<Plan>("openExistingBackup", {
                  name: o.name,
                  repository: o.folder,
                  key: o.key,
                });
                notify(r.openOk);
                setPlan(p.id);
                setDestination(p.destinations[0]?.id ?? "");
                setSnapshots([]);
                setNodes([]);
                setSelected("");
              });
            }}
          >
            <div className="gx-dialog__body">
              <Field label={r.openName} htmlFor="rs-open-name">
                <Input
                  id="rs-open-name"
                  value={opening.name}
                  maxLength={120}
                  onChange={(e) =>
                    setOpening({ ...opening, name: e.target.value })
                  }
                />
              </Field>
              <div
                className="gx-field"
                role="group"
                aria-labelledby="rs-open-folder-label"
              >
                <span className="gx-label" id="rs-open-folder-label">
                  {r.openFolder}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void choose(true).then((folder) => {
                        if (folder) setOpening({ ...opening, folder });
                      })
                    }
                  >
                    <FolderOpen size={15} aria-hidden="true" />
                    {r.openChoose}
                  </Button>
                  {opening.folder ? (
                    <span className="gx-path" title={opening.folder}>
                      {opening.folder}
                    </span>
                  ) : null}
                </div>
              </div>
              <Field label={r.openKey} htmlFor="rs-open-key">
                <PasswordInput
                  id="rs-open-key"
                  value={opening.key}
                  autoComplete="off"
                  showLabel={t.signin.showPassword}
                  hideLabel={t.signin.hidePassword}
                  onChange={(e) =>
                    setOpening({ ...opening, key: e.target.value })
                  }
                />
              </Field>
            </div>
            <footer className="gx-dialog__foot">
              <Button variant="secondary" onClick={() => setOpening(null)}>
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                disabled={
                  !opening.name.trim() ||
                  !opening.folder ||
                  opening.key.trim().length < 8
                }
              >
                {r.openSubmit}
              </Button>
            </footer>
          </form>
        ) : null}
      </GxDialog>

      <GxDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={r.confirmTitle}
        closeLabel={t.common.close}
        width={500}
      >
        <div className="gx-dialog__body">
          <p className="gx-muted">
            {pending
              ? format(r.confirmBody, {
                  what: pending.selection || r.everything,
                  target: pending.target,
                })
              : ""}
          </p>
        </div>
        <footer className="gx-dialog__foot">
          <Button variant="secondary" onClick={() => setPending(null)}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={() => {
              const p = pending;
              setPending(null);
              if (p) void act(() => runRestore(p.selection, p.target));
            }}
          >
            {r.confirm}
          </Button>
        </footer>
      </GxDialog>
    </div>
  );
}
