"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge, DataTable, SelectMenu } from "../../ui";
import { actionInfo } from "../event-labels";

export interface HistoryRow {
  id: number;
  at: string;
  atLabel: string;
  atRelative: string;
  actor: string;
  action: string;
  clientId: string | null;
  clientName: string | null;
  ip: string;
  details: [string, string][];
}

const ACTOR: Record<string, string> = {
  admin: "You",
  client: "Client",
  device: "PC",
  system: "System",
};

const col = createColumnHelper<HistoryRow>();

const columns = [
  col.accessor("at", {
    header: "When",
    cell: (c) => (
      <div className="gx-cell-main">
        <span className="gx-nowrap">{c.row.original.atLabel}</span>
        <span className="gx-cell-sub">{c.row.original.atRelative}</span>
      </div>
    ),
  }),
  col.accessor((r) => actionInfo(r.action).label, {
    id: "action",
    header: "Event",
    cell: (c) => (
      <Badge tone={actionInfo(c.row.original.action).tone}>
        {c.getValue()}
      </Badge>
    ),
  }),
  col.accessor((r) => ACTOR[r.actor] ?? r.actor, {
    id: "actor",
    header: "By",
  }),
  col.accessor((r) => r.clientName ?? "", {
    id: "client",
    header: "Client",
    cell: (c) =>
      c.row.original.clientId ? (
        <Link
          href={`/bkpadmin/clients/${c.row.original.clientId}`}
          className="gx-link"
        >
          {c.row.original.clientName ?? "Deleted client"}
        </Link>
      ) : (
        <span className="gx-muted">—</span>
      ),
  }),
  col.accessor("details", {
    header: "Details",
    enableSorting: false,
    cell: (c) =>
      c.getValue().length ? (
        <div className="gx-kv">
          {c.getValue().map(([k, v]) => (
            <span key={k} className="gx-kv__item">
              <span className="gx-kv__key">{k}</span> {v}
            </span>
          ))}
        </div>
      ) : (
        <span className="gx-muted">—</span>
      ),
  }),
  col.accessor("ip", {
    header: "IP",
    cell: (c) =>
      c.getValue() ? (
        <span className="gx-tabular gx-muted">{c.getValue()}</span>
      ) : (
        <span className="gx-muted">—</span>
      ),
  }),
];

export function HistoryTable({
  rows,
  clients,
  client,
}: {
  rows: HistoryRow[];
  clients: { id: string; name: string }[];
  client: string | null;
}) {
  const router = useRouter();
  const options = [
    { value: "all", label: "All clients" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];
  return (
    <DataTable
      label="History"
      columns={columns}
      data={rows}
      initialSort={[{ id: "at", desc: true }]}
      pageSize={25}
      searchText={(r) =>
        [actionInfo(r.action).label, r.clientName ?? "", r.ip, r.actor].join(
          " ",
        )
      }
      searchPlaceholder="Search events"
      toolbar={
        <div className="gx-toolbar-field">
          <SelectMenu
            ariaLabel="Filter by client"
            value={client ?? "all"}
            options={options}
            onValueChange={(v) =>
              router.push(
                v === "all"
                  ? "/bkpadmin/history"
                  : `/bkpadmin/history?client=${encodeURIComponent(v)}`,
              )
            }
          />
        </div>
      }
      empty={{
        title: "No history yet",
        description: client
          ? "Nothing has happened for this client yet."
          : "Sign-ins, codes and your changes will appear here.",
      }}
    />
  );
}
