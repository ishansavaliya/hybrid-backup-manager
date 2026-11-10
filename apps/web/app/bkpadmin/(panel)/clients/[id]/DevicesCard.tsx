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
}

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
