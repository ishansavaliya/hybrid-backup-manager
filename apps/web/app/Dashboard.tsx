"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import {
  Activity,
  ArrowRight,
  Database,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Monitor,
  RefreshCw,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Badge, Brand, Button, Card } from "@bakvion/ui";
type Device = {
  id: string;
  name: string;
  last_seen_at: string | null;
  agent_version: string | null;
};
type Run = {
  id: string;
  device_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
};
type CloudSnapshot = {
  id: string;
  device_id: string;
  restic_id: string;
  created_at: string;
};
const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Devices", icon: Monitor },
  { name: "Backup history", icon: Activity },
  { name: "Snapshots", icon: Database },
  { name: "Settings", icon: Settings },
];
export default function Dashboard() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState("Overview");
  const [devices, setDevices] = useState<Device[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [snapshots, setSnapshots] = useState<CloudSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    void client.auth.getUser().then(({ data, error }) => {
      setUser(data.user);
      if (error && error.name !== "AuthSessionMissingError")
        setError(error.message);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => subscription.unsubscribe();
  }, [client]);
  const refresh = useCallback(async () => {
    if (!client || !user) return;
    setBusy(true);
    setError("");
    try {
      const [d, r, s] = await Promise.all([
        client
          .from("devices")
          .select("id,name,last_seen_at,agent_version")
          .order("name"),
        client
          .from("backup_runs")
          .select("id,device_id,status,started_at,finished_at")
          .order("started_at", { ascending: false })
          .limit(100),
        client
          .from("snapshots")
          .select("id,device_id,restic_id,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      for (const result of [d, r, s]) if (result.error) throw result.error;
      setDevices(d.data ?? []);
      setRuns(r.data ?? []);
      setSnapshots(s.data ?? []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : String(e),
      );
    } finally {
      setBusy(false);
    }
  }, [client, user]);
  useEffect(() => {
    void refresh();
    if (!user) return;
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [refresh, user]);
  async function login() {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setNotice("Check your email for a secure sign-in link.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="content">
        <Brand />
        <p role="status">Checking your session…</p>
      </main>
    );
  if (!client || !user)
    return (
      <main className="content">
        <Brand />
        <Card className="auth-card">
          <ShieldCheck size={35} color="var(--brand)" />
          <h1 style={{ marginTop: 20 }}>
            Your protection.
            <br />
            One secure workspace.
          </h1>
          <p className="muted">
            Sign in to view metadata synchronized from your backup agents.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {!client ? (
            <div className="notice">
              Cloud setup required. Configure NEXT_PUBLIC_SUPABASE_URL and
              NEXT_PUBLIC_SUPABASE_ANON_KEY, then apply the supplied migrations.
              Local backups and offline recovery remain independent.
            </div>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <label className="field">
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                />
              </label>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Email a sign-in link"}
                <ArrowRight size={15} />
              </Button>
            </form>
          )}
          <p className="muted" style={{ fontSize: 12 }}>
            Development milestone · Agent enrollment and synchronization are not
            enabled yet.
          </p>
        </Card>
      </main>
    );
  const online = (d: Device) =>
    Boolean(
      d.last_seen_at &&
      Date.now() - new Date(d.last_seen_at).valueOf() < 120000,
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div>
          <div className="nav-label">Management</div>
          <nav className="nav" aria-label="Management navigation">
            {nav.map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                aria-current={tab === name ? "page" : undefined}
                onClick={() => setTab(name)}
              >
                <Icon size={18} />
                {name}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <strong>Cloud metadata only</strong>
          <p>
            Archives stay in your own storage. Your Windows agent performs
            backups and recovery.
          </p>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>Management / {tab}</span>
          <div className="top-actions">
            <span>{user.email}</span>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => {
                void client.auth.signOut().then(({ error }) => {
                  if (error) setError(error.message);
                  else {
                    setDevices([]);
                    setRuns([]);
                    setSnapshots([]);
                  }
                });
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>
                {tab === "Overview" ? "Your protection, at a glance" : tab}
              </h1>
              <p>Authorized device metadata from your Bakvion workspace.</p>
            </div>
            <Button
              className="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} />
              {busy ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="notice">
            Agent enrollment, metadata sync and remote commands are not
            implemented in this milestone. No local drive access is available
            from this website.
          </div>
          {tab === "Overview" && (
            <>
              <div className="banner">
                <ShieldCheck size={35} color="var(--brand)" />
                <div>
                  <h2>Your data belongs to you</h2>
                  <p>
                    Device status reflects the last received heartbeat. Offline
                    devices cannot accept recovery requests.
                  </p>
                </div>
              </div>
              <div className="metrics">
                {[
                  ["Registered devices", devices.length],
                  ["Online devices", devices.filter(online).length],
                  [
                    "Successful runs",
                    runs.filter((r) => r.status === "succeeded").length,
                  ],
                  [
                    "Failed runs",
                    runs.filter((r) => r.status === "failed").length,
                  ],
                ].map(([label, value]) => (
                  <Card key={label}>
                    <div className="metric-label">
                      {label}
                      <HardDrive size={17} />
                    </div>
                    <div className="metric-value">{value}</div>
                    <small>From synchronized metadata</small>
                  </Card>
                ))}
              </div>
            </>
          )}
          {(tab === "Devices" || tab === "Overview") && (
            <Card>
              <h2>Registered devices</h2>
              {devices.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>Status</th>
                        <th>Last seen</th>
                        <th>Agent version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((d) => (
                        <tr key={d.id}>
                          <td>{d.name}</td>
                          <td>
                            <Badge tone={online(d) ? "success" : "warning"}>
                              {online(d) ? "Online" : "Offline"}
                            </Badge>
                          </td>
                          <td>
                            {d.last_seen_at
                              ? new Date(d.last_seen_at).toLocaleString()
                              : "Never"}
                          </td>
                          <td>{d.agent_version ?? "Unknown"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <Monitor size={30} />
                  <strong>No devices registered</strong>Device enrollment is
                  pending implementation.
                </div>
              )}
            </Card>
          )}
          {tab === "Backup history" && (
            <Card>
              <h2>Recent backup runs</h2>
              {runs.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Device</th>
                        <th>Status</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id}>
                          <td>{r.id.slice(0, 8)}</td>
                          <td>
                            {devices.find((d) => d.id === r.device_id)?.name ??
                              r.device_id}
                          </td>
                          <td>
                            <Badge
                              tone={
                                r.status === "succeeded"
                                  ? "success"
                                  : r.status === "failed"
                                    ? "danger"
                                    : "neutral"
                              }
                            >
                              {r.status}
                            </Badge>
                          </td>
                          <td>{new Date(r.started_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <strong>No synchronized runs</strong>Backup results appear
                  after agent synchronization is enabled.
                </div>
              )}
            </Card>
          )}
          {tab === "Snapshots" && (
            <Card>
              <h2>Snapshot metadata</h2>
              {snapshots.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Snapshot</th>
                        <th>Device</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.map((s) => (
                        <tr key={s.id}>
                          <td className="path">{s.restic_id.slice(0, 12)}</td>
                          <td>
                            {devices.find((d) => d.id === s.device_id)?.name ??
                              s.device_id}
                          </td>
                          <td>{new Date(s.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <Database size={30} />
                  <strong>No snapshot metadata received</strong>Browse local
                  snapshots in the desktop app without waiting for cloud sync.
                </div>
              )}
            </Card>
          )}
          {tab === "Settings" && (
            <Card>
              <h2>Account and deployment</h2>
              <p>
                Signed in as {user.email}. Authentication and data access use
                Supabase Auth and row-level security.
              </p>
              <p className="muted">
                Configure authorized redirect URLs in Supabase. This application
                does not collect repository passwords or storage provider
                tokens.
              </p>
              <Badge tone="warning">Development milestone</Badge>
            </Card>
          )}
          <div className="footer-note">
            <span>Your Data. Always Protected.</span>
            <span>Bakvion 0.1 · Cloud foundation</span>
          </div>
        </div>
      </main>
    </div>
  );
}
