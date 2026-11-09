import { Badge, Button, Card } from "@bakvion/ui";
import type { DeviceRecord } from "../../../../../lib/server/repo";
import { removeDeviceAction } from "../../../actions";
import { daysAgo } from "../../format";

export function DevicesCard({
  clientId,
  devices,
  now,
}: {
  clientId: string;
  devices: DeviceRecord[];
  now: Date;
}) {
  const live = devices.filter((d) => d.removedAt === null);
  return (
    <Card className="stack">
      <h2>PCs</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Machine</th>
              <th>Windows</th>
              <th>App version</th>
              <th>Mode</th>
              <th>Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {live.map((d) => (
              <tr key={d.id}>
                <td>{d.machineName}</td>
                <td>{d.windowsVersion}</td>
                <td>{d.appVersion}</td>
                <td>
                  <Badge tone={d.mode === "full" ? "success" : "warning"}>
                    {d.mode === "full" ? "Full" : "Restore only"}
                  </Badge>
                </td>
                <td>{daysAgo(d.lastSeenAt, now)}</td>
                <td>
                  <form action={removeDeviceAction}>
                    <input type="hidden" name="id" value={clientId} />
                    <input type="hidden" name="deviceId" value={d.id} />
                    <Button type="submit" className="danger">
                      Remove
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
            {live.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No PCs signed in.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
