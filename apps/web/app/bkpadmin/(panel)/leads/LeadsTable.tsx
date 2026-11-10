"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import {
  MessageCircle,
  Monitor,
  UserPlus,
  Globe,
  MailWarning,
} from "lucide-react";
import { leadStatusAction } from "../../actions";
import { CopyButton } from "../CopyButton";
import { Button, DataTable, Notice, Segmented, SelectMenu } from "../../ui";

export type LeadStatusKey =
  "new" | "contacted" | "converted" | "not_interested";

export interface LeadRow {
  id: string;
  createdAt: string;
  createdLabel: string;
  createdRelative: string;
  name: string;
  business: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  pcs: number | null;
  message: string;
  source: "website" | "app";
  status: LeadStatusKey;
  emailSent: boolean;
  clientId: string | null;
}

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Became client" },
  { value: "not_interested", label: "Not interested" },
];

function StatusCell({
  row,
  onError,
}: {
  row: LeadRow;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(row.status);
  const [pending, start] = useTransition();
  return (
    <div className="gx-lead-status" data-pending={pending || undefined}>
      <SelectMenu
        ariaLabel={`Status for ${row.business}`}
        value={value}
        options={STATUS_OPTIONS}
        onValueChange={(next) => {
          const before = value;
          setValue(next);
          start(async () => {
            const r = await leadStatusAction(row.id, next);
            if (r.error) {
              setValue(before);
              onError(r.error);
            } else {
              onError(null);
              router.refresh();
            }
          });
        }}
      />
    </div>
  );
}

const col = createColumnHelper<LeadRow>();

function buildColumns(onError: (m: string | null) => void) {
  return [
    col.accessor("createdAt", {
      header: "Received",
      cell: (c) => (
        <div className="gx-cell-main">
          <span className="gx-nowrap">{c.row.original.createdLabel}</span>
          <span className="gx-cell-sub">{c.row.original.createdRelative}</span>
        </div>
      ),
    }),
    col.accessor("business", {
      header: "Enquiry",
      cell: (c) => {
        const r = c.row.original;
        return (
          <div className="gx-cell-main gx-lead-main">
            <span className="gx-strong">{r.business}</span>
            <span className="gx-cell-sub">
              {r.name}
              {r.city ? ` · ${r.city}` : ""}
              {r.pcs ? ` · ${r.pcs} PC${r.pcs === 1 ? "" : "s"}` : ""}
            </span>
            {r.message ? (
              <span className="gx-lead-message" title={r.message}>
                “{r.message}”
              </span>
            ) : null}
          </div>
        );
      },
    }),
    col.accessor("phone", {
      header: "Contact",
      cell: (c) => {
        const r = c.row.original;
        return (
          <div className="gx-cell-main">
            <span className="gx-tabular">{r.phone}</span>
            {r.email ? <span className="gx-cell-sub">{r.email}</span> : null}
          </div>
        );
      },
    }),
    col.accessor("source", {
      header: "From",
      cell: (c) => (
        <span className="gx-cell-sub gx-nowrap">
          {c.getValue() === "app" ? (
            <Monitor size={14} aria-hidden="true" />
          ) : (
            <Globe size={14} aria-hidden="true" />
          )}
          {c.getValue() === "app" ? "App" : "Website"}
          {!c.row.original.emailSent ? (
            <span
              title="Notification email was not sent"
              className="gx-warn-icon"
            >
              <MailWarning size={14} aria-label="Email not sent" />
            </span>
          ) : null}
        </span>
      ),
    }),
    col.accessor("status", {
      header: "Status",
      cell: (c) => <StatusCell row={c.row.original} onError={onError} />,
    }),
    col.display({
      id: "actions",
      header: () => <span className="gx-sr-only">Actions</span>,
      cell: (c) => {
        const r = c.row.original;
        return (
          <div className="gx-row-actions">
            <CopyButton text={r.phone} label="Phone" size="sm" />
            <Button
              variant="secondary"
              size="sm"
              href={`https://wa.me/${r.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp ${r.name}`}
            >
              <MessageCircle size={15} aria-hidden="true" />
              WhatsApp
            </Button>
            {r.clientId ? (
              <Button
                variant="ghost"
                size="sm"
                href={`/bkpadmin/clients/${r.clientId}`}
              >
                Open client
              </Button>
            ) : (
              <Button
                size="sm"
                href={`/bkpadmin?new=1&lead=${r.id}`}
                aria-label={`Create client from ${r.business}`}
              >
                <UserPlus size={15} aria-hidden="true" />
                Create client
              </Button>
            )}
          </div>
        );
      },
    }),
  ];
}

type Filter = "all" | LeadStatusKey;

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const [filter, setFilter] = useState<Filter>(
    rows.some((r) => r.status === "new") ? "new" : "all",
  );
  const [error, setError] = useState<string | null>(null);
  const columns = useMemo(() => buildColumns(setError), []);
  const visible =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const count = (k: LeadStatusKey) => rows.filter((r) => r.status === k).length;
  return (
    <>
      <Notice error={error} />
      <DataTable
        label="Leads"
        columns={columns}
        data={visible}
        initialSort={[{ id: "createdAt", desc: true }]}
        searchText={(r) =>
          [r.name, r.business, r.phone, r.email, r.city, r.message].join(" ")
        }
        searchPlaceholder="Search name, business, phone or city"
        toolbar={
          <Segmented<Filter>
            label="Filter leads"
            value={filter}
            onChange={setFilter}
            options={[
              { key: "new", label: "New", count: count("new") },
              {
                key: "contacted",
                label: "Contacted",
                count: count("contacted"),
              },
              {
                key: "converted",
                label: "Became client",
                count: count("converted"),
              },
              {
                key: "not_interested",
                label: "Not interested",
                count: count("not_interested"),
              },
              { key: "all", label: "All", count: rows.length },
            ]}
          />
        }
        empty={
          rows.length === 0
            ? {
                title: "No enquiries yet",
                description:
                  "When someone clicks “Connect with Bakvion experts” on the website or in the app, it appears here and you get an email.",
              }
            : {
                title: "Nothing here",
                description: "No leads with this status.",
              }
        }
      />
    </>
  );
}
