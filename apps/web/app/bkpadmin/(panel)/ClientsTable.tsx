"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge, DataTable, Segmented, StatusBadge } from "../ui";
import type { ClientStatus } from "../ui";

export type ClientFilterKey =
  "all" | "expiring" | "expired" | "blocked" | "test";

/** Serialisable row prepared on the server (no Date objects). */
export interface ClientRow {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  username: string;
  isTest: boolean;
  status: Exclude<ClientStatus, "test">;
  expiresAt: string;
  expiresLabel: string;
  /** e.g. "6 days left", "Expired 3 days ago". */
  expiresHint: string;
  pcsUsed: number;
  pcLimit: number;
  lastSeenAt: string | null;
  lastSeenLabel: string;
  /** Filters this row belongs to (same rules as the server's filterClients). */
  filters: ClientFilterKey[];
}

const col = createColumnHelper<ClientRow>();

const columns = [
  col.accessor("name", {
    header: "Client",
    cell: (c) => (
      <div className="gx-cell-main">
        <Link
          href={`/bkpadmin/clients/${c.row.original.id}`}
          className="gx-link"
        >
          {c.getValue()}
        </Link>
        <span className="gx-cell-sub">
          {c.row.original.contactPerson || c.row.original.username || "—"}
          {c.row.original.isTest ? <Badge tone="accent">Test</Badge> : null}
        </span>
      </div>
    ),
  }),
  col.accessor("phone", {
    header: "Phone",
    cell: (c) => c.getValue() || <span className="gx-muted">—</span>,
  }),
  col.accessor("status", {
    header: "Status",
    cell: (c) => <StatusBadge status={c.getValue()} />,
  }),
  col.accessor("expiresAt", {
    header: "Membership ends",
    cell: (c) => (
      <div className="gx-cell-main">
        <span>{c.row.original.expiresLabel}</span>
        <span className="gx-cell-sub">{c.row.original.expiresHint}</span>
      </div>
    ),
  }),
  col.accessor((r) => r.pcsUsed / r.pcLimit, {
    id: "pcs",
    header: "PCs",
    cell: (c) => (
      <span className="gx-tabular">
        {c.row.original.pcsUsed} / {c.row.original.pcLimit}
      </span>
    ),
  }),
  col.accessor((r) => r.lastSeenAt ?? "", {
    id: "lastSeen",
    header: "Last seen",
    cell: (c) => (
      <span className={c.row.original.lastSeenAt ? undefined : "gx-muted"}>
        {c.row.original.lastSeenLabel}
      </span>
    ),
  }),
];

const FILTERS: { key: ClientFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expiring", label: "Expiring" },
  { key: "expired", label: "Expired" },
  { key: "blocked", label: "Blocked" },
  { key: "test", label: "Test" },
];

export function ClientsTable({
  rows,
  initialFilter,
}: {
  rows: ClientRow[];
  initialFilter: ClientFilterKey;
}) {
  const [filter, setFilter] = useState<ClientFilterKey>(initialFilter);
  const visible = useMemo(
    () =>
      filter === "all" ? rows : rows.filter((r) => r.filters.includes(filter)),
    [rows, filter],
  );
  const options = FILTERS.map((f) => ({
    ...f,
    count:
      f.key === "all"
        ? rows.length
        : rows.filter((r) => r.filters.includes(f.key)).length,
  }));
  return (
    <DataTable
      label="Clients"
      columns={columns}
      data={visible}
      initialSort={[{ id: "expiresAt", desc: false }]}
      searchText={(r) =>
        [r.name, r.contactPerson, r.phone, r.username].join(" ")
      }
      searchPlaceholder="Search name, phone or username"
      toolbar={
        <Segmented
          label="Filter clients"
          options={options}
          value={filter}
          onChange={setFilter}
        />
      }
      rowHref={(r) => `/bkpadmin/clients/${r.id}`}
      empty={
        rows.length === 0
          ? {
              title: "No clients yet",
              description:
                "Create your first client, then give them a username and password or a 6-digit code.",
            }
          : { title: "Nothing here", description: "No clients in this filter." }
      }
    />
  );
}
