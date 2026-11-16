"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Monitor } from "lucide-react";
import { removeDeviceAction } from "../../../actions";
import { Badge, ConfirmForm, DataTable } from "../../../ui";

export interface DeviceRow {
  id: string;
  machineName: string;
  windowsVersion: string;
  appVersion: string;
  mode: "full" | "restore_only";
  lastSeenAt: string;
  lastSeenLabel: string;
  lastBackup: {
    at: string;
    label: string;
    state: "succeeded" | "failed" | "interrupted";
    plan: string;
  } | null;
  reportEmails: string[];
  reportMode: "all" | "failures" | "off";
}

const RUN_BADGE = {
  succeeded: { tone: "success", label: "Completed" },
  failed: { tone: "danger", label: "Failed" },
  interrupted: { tone: "warning", label: "Interrupted" },
} as const;

const MODE_LABEL = {
  all: "Every backup",
  failures: "Failures only",
  off: "Off",
} as const;

const col = createColumnHelper<DeviceRow>();

function columns(clientId: string) {
  return [
    col.accessor("machineName", {
      header: "PC",
      cell: (c) => (
        <div className="gx-cell-icon">
          <span className="gx-cell-icon__box" aria-hidden="true">
            <Monitor size={15} />
          </span>
          <div className="gx-cell-main">
            <span className="gx-strong">{c.getValue() || "Unnamed PC"}</span>
            <span className="gx-cell-sub">
              {c.row.original.windowsVersion || "Windows"} · v
              {c.row.original.appVersion || "?"}
            </span>
          </div>
        </div>
      ),
    }),
    col.accessor("mode", {
      header: "Mode",
      cell: (c) =>
        c.getValue() === "full" ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            Restore only
          </Badge>
        ),
    }),
    col.accessor((r) => r.lastBackup?.at ?? "", {
      id: "lastBackup",
      header: "Last backup",
      cell: (c) => {
        const b = c.row.original.lastBackup;
        if (!b) return <span className="gx-muted">No reports yet</span>;
        const badge = RUN_BADGE[b.state];
        return (
          <div className="gx-cell-main">
            <span>
              <Badge tone={badge.tone} dot>
                {badge.label}
              </Badge>
            </span>
            <span className="gx-cell-sub">
              {b.plan} · {b.label}
            </span>
          </div>
        );
      },
    }),
    col.accessor((r) => r.reportEmails.length, {
      id: "reports",
      header: "Email reports",
      enableSorting: false,
      cell: (c) => {
        const { reportEmails, reportMode } = c.row.original;
        if (!reportEmails.length || reportMode === "off")
          return <span className="gx-muted">Off</span>;
        return (
          <div className="gx-cell-main">
            <span>{MODE_LABEL[reportMode]}</span>
            <span className="gx-cell-sub" title={reportEmails.join(", ")}>
              {reportEmails.length === 1
                ? reportEmails[0]
                : `${reportEmails.length} addresses`}
            </span>
          </div>
        );
      },
    }),
    col.accessor("lastSeenAt", {
      header: "Last seen",
      cell: (c) => c.row.original.lastSeenLabel,
    }),
    col.display({
      id: "remove",
      header: () => <span className="gx-sr-only">Actions</span>,
      cell: (c) => (
        <div className="gx-cell-end">
          <ConfirmForm
            action={removeDeviceAction}
            fields={{ id: clientId, deviceId: c.row.original.id }}
            trigger="Remove"
            triggerVariant="ghost"
            size="sm"
            title="Remove this PC?"
            description="It is signed out the next time it connects and frees a PC slot. Its local backups and settings stay on the PC."
            confirmLabel="Remove PC"
          />
        </div>
      ),
    }),
  ];
}

export function DevicesCard({
  clientId,
  devices,
}: {
  clientId: string;
  devices: DeviceRow[];
}) {
  return (
    <DataTable
      label="PCs"
      columns={columns(clientId)}
      data={devices}
      initialSort={[{ id: "lastSeenAt", desc: true }]}
      pageSize={10}
      empty={{
        title: "No PCs yet",
        description:
          "PCs appear here after the client signs in to the Bakvion app.",
      }}
    />
  );
}
