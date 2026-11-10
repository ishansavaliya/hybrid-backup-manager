import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Database,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  LockKeyhole,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  WifiOff,
} from "lucide-react";
import { Badge, Brand, Button, Card, Modal } from "@bakvion/ui";
import type {
  AgentOverview,
  Plan,
  Snapshot,
  SnapshotNode,
} from "@bakvion/shared-types";
import { planSchema } from "@bakvion/validation";
import { choose, request } from "./api";
import { useAccount } from "./account/useAccount";
import { SignIn } from "./account/SignIn";
import { MembershipBadge } from "./account/MembershipBadge";
import { SyncIndicator } from "./account/SyncIndicator";
import { RestoreOnlyNotice } from "./account/RestoreOnlyNotice";
import { AccountPanel } from "./account/AccountPanel";

type Tab = "Overview" | "Backup plans" | "Recovery" | "Activity" | "Settings";
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Backup plans", icon: Database },
  { name: "Recovery", icon: ArrowDownToLine },
  { name: "Activity", icon: Activity },
  { name: "Settings", icon: Settings },
] as const;
const date = (v: string) => new Date(v).toLocaleString();
const tone = (v: string): "success" | "danger" | "warning" | "neutral" =>
  v === "succeeded"
    ? "success"
    : v === "failed" || v === "interrupted"
      ? "danger"
      : v === "running" || v === "queued"
        ? "warning"
        : "neutral";
export default function App() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<AgentOverview | null>(null);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(false);
  const account = useAccount();
  const [showSignIn, setShowSignIn] = useState(false);
  const [dark, setDark] = useState(
    localStorage.getItem("bakvion-theme") === "dark",
  );
  const refresh = useCallback(async () => {
    try {
      setData(await request<AgentOverview>("overview"));
      setConnectionError("");
    } catch (e) {
      setData(null);
      setConnectionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", dark);
    localStorage.setItem("bakvion-theme", dark ? "dark" : "light");
  }, [dark]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const plans = data?.plans ?? [];
  const jobs = data?.executions ?? [];
  const successful = jobs.filter((j) => j.state === "succeeded");
  const active = jobs.filter(
    (j) => j.state === "running" || j.state === "queued",
  );
  const failed = jobs.filter(
    (j) => j.state === "failed" || j.state === "interrupted",
  );
  const last = successful[0];
  const acct = account.status;
  const backupsPaused = !!acct && acct.mode !== "full";
  if (
    acct &&
    acct.mode === "signed_out" &&
    data &&
    (!plans.length || showSignIn)
  )
    return (
      <SignIn
        error={account.error}
        onSignIn={async (p) => {
          await account.signIn(p);
          setShowSignIn(false);
        }}
        onCancel={plans.length ? () => setShowSignIn(false) : undefined}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div>
          <div className="nav-label">Workspace</div>
          <nav aria-label="Main navigation" className="nav">
            {navigation.map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
                aria-current={tab === name ? "page" : undefined}
              >
                <Icon size={18} />
                {name}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="row">
            <LockKeyhole size={17} />
            <strong>Private by design</strong>
          </div>
          <p>
            Encrypted repositories.
            <br />
            Recovery without the cloud.
          </p>
          <Badge tone={data ? "success" : "warning"}>
            {data ? "Local agent connected" : "Agent disconnected"}
          </Badge>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Personal workspace{" "}
            <ChevronRight
              size={12}
              style={{ display: "inline", margin: "0 10px" }}
            />{" "}
            {tab}
          </span>
          <div className="top-actions">
            {acct && <SyncIndicator status={acct} />}
            {acct && <MembershipBadge status={acct} />}
            <Badge tone={data ? "success" : "warning"}>
              {data ? "Local service" : "Offline"}
            </Badge>
            <button
              className="icon-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="avatar" aria-label="Local device">
              B
            </span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>
                {tab === "Overview" ? "Your protection, at a glance" : tab}
              </h1>
              <p>
                {tab === "Overview"
                  ? "A clear view of your backups, destinations and recovery."
                  : "Encrypted. Local-first. In your control."}
              </p>
            </div>
            {(tab === "Overview" || tab === "Backup plans") && (
              <Button
                onClick={() => setWizard(true)}
                disabled={!data || busy || backupsPaused}
              >
                <Plus size={16} />
                Create backup plan
              </Button>
            )}
          </div>
          {(error || connectionError) && (
            <div className="error" role="alert">
              {error || connectionError}
            </div>
          )}
          {acct && backupsPaused && (
            <RestoreOnlyNotice
              status={acct}
              busy={busy}
              onSync={() => void account.syncNow()}
              onSignIn={() => setShowSignIn(true)}
            />
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {loading ? (
            <Card>
              <p className="loading" role="status">
                Connecting to BakvionService…
              </p>
            </Card>
          ) : !data ? (
            <Card>
              <Empty
                icon={<WifiOff size={36} />}
                title="Connect your local backup service"
              >
                Start BakvionService on Windows, then reconnect. Existing backup
                repositories remain recoverable with the offline CLI.
              </Empty>
              <div className="row" style={{ justifyContent: "center" }}>
                <Button className="secondary" onClick={() => void refresh()}>
                  <RefreshCw size={14} />
                  Reconnect
                </Button>
              </div>
              <p
                className="muted"
                style={{ fontSize: 12, textAlign: "center" }}
              >
                Browser development mode has no access to your filesystem or
                service.
              </p>
            </Card>
          ) : (
            <>
              {tab === "Overview" && (
                <>
                  <div className="banner">
                    <ShieldCheck size={35} color="var(--brand)" />
                    <div>
                      <h2>
                        {last
                          ? "Your latest backup completed"
                          : "Let’s protect your first folder"}
                      </h2>
                      <p>
                        {last
                          ? `Last confirmed snapshot: ${date(last.finishedAt ?? last.startedAt)}. Restore verification is a separate check.`
                          : "Create a plan, initialize its destination and run your first encrypted backup."}
                      </p>
                    </div>
                  </div>
                  <div className="metrics">
                    <Metric
                      label="Backup plans"
                      value={String(plans.length)}
                      note="Configured on this device"
                      icon={<Database size={17} />}
                    />
                    <Metric
                      label="Successful runs"
                      value={String(successful.length)}
                      note="In the most recent 200 destination runs"
                      icon={<CheckCircle2 size={17} />}
                    />
                    <Metric
                      label="Active jobs"
                      value={String(active.length)}
                      note={
                        active.length
                          ? "Service continues when UI closes"
                          : "No backups currently queued"
                      }
                      icon={<Activity size={17} />}
                    />
                    <Metric
                      label="Needs attention"
                      value={String(failed.length)}
                      note="Failed or interrupted destination runs"
                      icon={<ShieldCheck size={17} />}
                    />
                  </div>
                  <div className="grid-two">
                    <Card>
                      <div className="section-heading">
                        <h2>Backup plans</h2>
                        <Button
                          className="secondary"
                          onClick={() => setTab("Backup plans")}
                        >
                          View all
                          <ArrowRight size={13} />
                        </Button>
                      </div>
                      {plans.length ? (
                        plans.map((p) => (
                          <div className="destination" key={p.id}>
                            <div className="row spread">
                              <div>
                                <h3>{p.name}</h3>
                                <small>
                                  {p.sources.length} sources ·{" "}
                                  {p.destinations.length} destinations
                                </small>
                              </div>
                              <Badge>Manual</Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <Empty
                          icon={<FolderOpen size={30} />}
                          title="A safe place for your files"
                        >
                          Start with a folder and a local or mounted
                          destination.
                        </Empty>
                      )}
                    </Card>
                    <Card>
                      <h2>Recovery readiness</h2>
                      <div className="stack">
                        <div className="row spread">
                          <span className="muted">Confirmed snapshots</span>
                          <strong>{successful.length}</strong>
                        </div>
                        <div className="row spread">
                          <span className="muted">Last verified restore</span>
                          <Badge tone="warning">Not measured</Badge>
                        </div>
                        <div className="row spread">
                          <span className="muted">Next schedule</span>
                          <span>Manual only</span>
                        </div>
                        <p className="muted" style={{ fontSize: 12 }}>
                          A successful backup does not establish recoverability.
                          Run a verified restore regularly.
                        </p>
                        <Button
                          className="secondary"
                          onClick={() => setTab("Recovery")}
                        >
                          Explore recovery
                          <ArrowRight size={13} />
                        </Button>
                      </div>
                    </Card>
                  </div>
                  <Card>
                    <div className="section-heading">
                      <h2>Recent destination activity</h2>
                      <Button
                        className="secondary"
                        onClick={() => setTab("Activity")}
                      >
                        View history
                      </Button>
                    </div>
                    <History jobs={jobs.slice(0, 5)} />
                  </Card>
                </>
              )}
              {tab === "Backup plans" && (
                <div className="stack">
                  {plans.length ? (
                    plans.map((p) => (
                      <Card key={p.id}>
                        <div className="section-heading">
                          <h2>{p.name}</h2>
                          <Button
                            disabled={
                              busy ||
                              backupsPaused ||
                              active.some((j) => j.planId === p.id)
                            }
                            onClick={() =>
                              void act(async () => {
                                await request("startBackup", { planId: p.id });
                                setMessage(
                                  "Backup queued. The service owns execution independently of this window.",
                                );
                              })
                            }
                          >
                            <Plus size={14} />
                            Run backup
                          </Button>
                        </div>
                        <p className="muted">
                          File-level backup · Manual schedule · No automatic
                          deletion
                        </p>
                        {p.sources.map((s) => (
                          <p className="path" key={s}>
                            {s}
                          </p>
                        ))}
                        {p.destinations.map((d) => (
                          <div className="destination" key={d.id}>
                            <div className="row spread">
                              <div>
                                <h3>
                                  <HardDrive
                                    size={15}
                                    style={{
                                      display: "inline",
                                      marginRight: 8,
                                    }}
                                  />
                                  {d.name}
                                </h3>
                                <span className="path">{d.repository}</span>
                              </div>
                              <div className="row">
                                <Button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(async () => {
                                      await request("testDestination", {
                                        planId: p.id,
                                        destinationId: d.id,
                                      });
                                      setMessage(
                                        "Destination write, flush and read-back test passed. This does not replace a repository integrity check.",
                                      );
                                    })
                                  }
                                >
                                  Test connection
                                </Button>
                                <Button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Initialize a new encrypted repository here? Existing repositories will not be overwritten. Keep an independent copy of the password.",
                                      )
                                    )
                                      void act(async () => {
                                        await request("initRepository", {
                                          planId: p.id,
                                          destinationId: d.id,
                                        });
                                        setMessage(
                                          "Repository initialized. You can now run a backup.",
                                        );
                                      });
                                  }}
                                >
                                  Initialize
                                </Button>
                                <Button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(async () => {
                                      await request("check", {
                                        planId: p.id,
                                        destinationId: d.id,
                                      });
                                      setMessage(
                                        "Full repository data integrity check passed.",
                                      );
                                    })
                                  }
                                >
                                  Verify repository
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <Empty
                        icon={<Database size={32} />}
                        title="No backup plans yet"
                      >
                        Create your first plan to protect files on this device.
                      </Empty>
                    </Card>
                  )}
                </div>
              )}
              {tab === "Activity" && (
                <Card>
                  <h2>Destination job history</h2>
                  <p className="muted">
                    Results are independent for every destination. Showing up to
                    200 recent runs.
                  </p>
                  <History jobs={jobs} />
                </Card>
              )}
              {tab === "Recovery" && (
                <Recovery
                  plans={plans}
                  busy={busy}
                  act={act}
                  notify={setMessage}
                />
              )}
              {tab === "Settings" && (
                <div className="grid-two">
                  {acct && (
                    <AccountPanel
                      status={acct}
                      error={account.error}
                      onSync={account.syncNow}
                      onSignOut={account.signOut}
                    />
                  )}
                  <Card>
                    <h2>Security and recovery keys</h2>
                    <p>
                      This development milestone uses an existing private
                      password file. Store it outside backup sources and
                      repositories, and keep a separate offline recovery copy.
                    </p>
                    <p className="muted">
                      Windows credential isolation, recovery-key enrollment and
                      code-signed installation are release blockers. Do not use
                      this build as your only protection for critical data.
                    </p>
                    <Badge tone="warning">Development milestone</Badge>
                  </Card>
                  <Card>
                    <h2>Service and maintenance</h2>
                    <p>
                      Closing this application does not stop the service.
                      Authorized administrators can stop or restart
                      BakvionService through Windows Services.
                    </p>
                    <p className="muted">
                      Scheduling, provider OAuth, hosted sync and automated
                      retention are not available in this build. Full-volume
                      selections are file-level backups, not bare-metal images.
                    </p>
                    <Button
                      className="secondary"
                      onClick={() => void refresh()}
                    >
                      <RefreshCw size={14} />
                      Refresh service status
                    </Button>
                  </Card>
                </div>
              )}
            </>
          )}
          <div className="footer-note">
            <span>
              <LockKeyhole
                size={10}
                style={{ display: "inline", marginRight: 5 }}
              />
              Restic encrypted snapshots · File-level protection
            </span>
            <span>Bakvion 0.1 · Development milestone</span>
          </div>
        </div>
      </main>
      <PlanWizard
        open={wizard}
        close={() => setWizard(false)}
        save={async (p) => {
          await request("savePlan", p);
          await refresh();
          setTab("Backup plans");
        }}
      />
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </Card>
  );
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children}
    </div>
  );
}
function History({ jobs }: { jobs: AgentOverview["executions"] }) {
  return jobs.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Plan / destination</th>
            <th>Started</th>
            <th>Status</th>
            <th>Snapshot / details</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>
                <strong>{j.planId}</strong>
                <br />
                <small>{j.destinationId}</small>
              </td>
              <td>{date(j.startedAt)}</td>
              <td>
                <Badge tone={tone(j.state)}>{j.state}</Badge>
              </td>
              <td>
                {j.error || j.snapshotId.slice(0, 12) || "Awaiting completion"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      icon={<Activity size={30} />}
      title="Your backup history starts here"
    >
      Completed and failed destination runs appear here after you run a backup.
    </Empty>
  );
}

function PlanWizard({
  open,
  close,
  save,
}: {
  open: boolean;
  close: () => void;
  save: (p: Plan) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState("");
  const [destinations, setDestinations] = useState<Plan["destinations"]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = () => crypto.randomUUID().replaceAll("-", "");
  async function native(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      const parsed = planSchema.parse({
        id: id(),
        name,
        sources,
        exclusions: exclusions.split("\n").filter(Boolean),
        destinations,
      });
      await save(parsed);
      close();
      setStep(0);
      setName("");
      setSources([]);
      setDestinations([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      title="Create a backup plan"
    >
      <div className="wizard-steps" aria-label={`Step ${step + 1} of 4`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i <= step ? "active" : ""} />
        ))}
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {step === 0 && (
        <div className="stack">
          <h3>01 · What would you like to protect?</h3>
          <label className="field">
            Plan name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Work documents"
            />
          </label>
          <Button
            className="secondary"
            onClick={() =>
              void native(async () => {
                const p = await choose(true);
                if (p && !sources.includes(p)) setSources([...sources, p]);
              })
            }
          >
            <FolderOpen size={15} />
            Add source folder or volume
          </Button>
          {sources.map((s) => (
            <div className="row spread" key={s}>
              <span className="path">{s}</span>
              <button
                className="icon-button"
                onClick={() => setSources(sources.filter((x) => x !== s))}
                aria-label={`Remove source ${s}`}
              >
                Remove
              </button>
            </div>
          ))}
          <label className="field">
            Exclusions · one restic pattern per line
            <textarea
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder="*.tmp"
            />
          </label>
          <small>
            Volume selections back up files. System imaging and bare-metal
            recovery are unavailable.
          </small>
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <h3>02 · Choose your destinations</h3>
          <p className="muted">
            Use a local disk or mounted filesystem. Cloud connectors are pending
            validation.
          </p>
          <Button
            className="secondary"
            onClick={() =>
              void native(async () => {
                const parent = await choose(true);
                if (parent)
                  setDestinations([
                    ...destinations,
                    {
                      id: id(),
                      name: `Destination ${destinations.length + 1}`,
                      repository:
                        parent.replace(/[\\/]$/, "") +
                        (parent.includes("\\") ? "\\" : "/") +
                        "BakvionRepository",
                      passwordFile: "",
                    },
                  ]);
              })
            }
          >
            <HardDrive size={15} />
            Add destination folder
          </Button>
          {destinations.map((d) => (
            <div className="destination stack" key={d.id}>
              <label className="field">
                Name
                <input
                  value={d.name}
                  onChange={(e) =>
                    setDestinations(
                      destinations.map((x) =>
                        x.id === d.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <span className="path">{d.repository}</span>
              <Button
                className="secondary"
                onClick={() =>
                  setDestinations(destinations.filter((x) => x.id !== d.id))
                }
              >
                Remove destination
              </Button>
            </div>
          ))}
          <small>
            A new BakvionRepository subfolder will be created only when you
            initialize it.
          </small>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <h3>03 · Encryption and recovery</h3>
          <div className="notice">
            Development mode requires an existing password file containing at
            least 16 bytes, protected by filesystem permissions. Keep an
            independent offline copy. Lost passwords cannot be recovered by
            Bakvion.
          </div>
          {destinations.map((d) => (
            <div className="destination" key={d.id}>
              <h3>{d.name}</h3>
              <Button
                className="secondary"
                onClick={() =>
                  void native(async () => {
                    const p = await choose(false);
                    if (p)
                      setDestinations(
                        destinations.map((x) =>
                          x.id === d.id ? { ...x, passwordFile: p } : x,
                        ),
                      );
                  })
                }
              >
                <LockKeyhole size={15} />
                Select password file
              </Button>
              <p className="path">
                {d.passwordFile || "No password file selected"}
              </p>
            </div>
          ))}
          <small>
            Manual execution only. No scheduled runs, automated pruning or email
            notifications are enabled.
          </small>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <h3>04 · Review your plan</h3>
          <p>
            <strong>{name}</strong> · {sources.length} sources ·{" "}
            {destinations.length} destinations
          </p>
          {sources.map((s) => (
            <span className="path" key={s}>
              {s}
            </span>
          ))}
          {destinations.map((d) => (
            <span className="path" key={d.id}>
              {d.name}: {d.repository}
            </span>
          ))}
          <div className="notice">
            Saving validates local configuration. Initialize each repository
            next, then run a backup. Existing repositories are never overwritten
            automatically.
          </div>
        </div>
      )}
      <div className="wizard-footer">
        <Button
          className="secondary"
          disabled={step === 0 || busy}
          onClick={() => setStep(step - 1)}
        >
          Back
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={
              (step === 0 && (!name.trim() || !sources.length)) ||
              (step === 1 && !destinations.length) ||
              (step === 2 && destinations.some((d) => !d.passwordFile))
            }
          >
            Continue
            <ArrowRight size={14} />
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void finish()}>
            {busy ? "Validating…" : "Save backup plan"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
function Recovery({
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
  const [planId, setPlan] = useState("");
  const [destinationId, setDestination] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState("");
  const [nodes, setNodes] = useState<SnapshotNode[]>([]);
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const plan = plans.find((p) => p.id === planId);
  const params = { planId, destinationId };
  async function restore(selection = "") {
    const parent = await choose(true);
    if (!parent) return;
    const target =
      parent.replace(/[\\/]$/, "") +
      (parent.includes("\\") ? "\\" : "/") +
      `Bakvion-Restore-${Date.now()}`;
    if (
      !confirm(
        `Restore ${selection || "the full snapshot"} into a new folder at ${target}? Existing files will not be overwritten.`,
      )
    )
      return;
    const result = await request<{ verifiedFiles: number }>("restore", {
      ...params,
      snapshotId: selected,
      target,
      selection,
    });
    notify(
      `Restore completed: ${result.verifiedFiles} files verified. Output: ${target}`,
    );
  }
  return (
    <div className="stack">
      <Card>
        <h2>Find a recovery point</h2>
        <div className="row">
          <label className="field">
            Backup plan
            <select
              value={planId}
              onChange={(e) => {
                setPlan(e.target.value);
                setDestination("");
                setSnapshots([]);
                setNodes([]);
                setSelected("");
              }}
            >
              <option value="">Select plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Destination
            <select
              value={destinationId}
              onChange={(e) => {
                setDestination(e.target.value);
                setSnapshots([]);
                setNodes([]);
                setSelected("");
              }}
            >
              <option value="">Select destination</option>
              {plan?.destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
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
            <Search size={14} />
            Find snapshots
          </Button>
          <label className="field">
            Filter date
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        </div>
      </Card>
      <div className="grid-two">
        <Card>
          <h2>
            <CalendarDays
              size={17}
              style={{ display: "inline", marginRight: 8 }}
            />
            Snapshot history
          </h2>
          {snapshots
            .filter((s) => !day || s.time.slice(0, 10) === day)
            .map((s) => (
              <div className="destination" key={s.id}>
                <div className="row spread">
                  <div>
                    <strong>{date(s.time)}</strong>
                    <p className="path">{s.id.slice(0, 12)}</p>
                  </div>
                  <Button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const list = await request<SnapshotNode[]>("browse", {
                          ...params,
                          snapshotId: s.id,
                        });
                        setNodes(list);
                        setSelected(s.id);
                      })
                    }
                  >
                    Browse
                  </Button>
                </div>
              </div>
            ))}
          {!snapshots.length && (
            <Empty
              icon={<CalendarDays size={28} />}
              title="Choose a repository"
            >
              Browse snapshots directly from the repository, without internet
              access.
            </Empty>
          )}
        </Card>
        <Card>
          <h2>Restore safely</h2>
          <p className="muted">
            Restore into a new folder. Files are verified against the encrypted
            snapshot before the recovery tree is published.
          </p>
          <p className="muted">
            Links and special files are rejected in this milestone.
            Original-path overwrite is unavailable.
          </p>
          <Button
            disabled={!selected || busy}
            onClick={() => void act(() => restore())}
          >
            <ArrowDownToLine size={14} />
            Restore full snapshot
          </Button>
        </Card>
      </div>
      {selected && (
        <Card>
          <div className="section-heading">
            <h2>Snapshot files</h2>
            <input
              className="search"
              aria-label="Search snapshot files"
              placeholder="Search paths…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Type</th>
                  <th>Bytes</th>
                  <th>Recovery</th>
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
                      <td className="path">{n.path}</td>
                      <td>{n.type}</td>
                      <td>
                        {n.type === "file"
                          ? (n.size ?? 0).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <Button
                          className="secondary"
                          disabled={
                            busy ||
                            !["file", "dir"].includes(n.type) ||
                            n.path === "/"
                          }
                          onClick={() => void act(() => restore(n.path))}
                        >
                          Restore
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <small>
            Showing up to 500 matching entries. Search to narrow the results.
          </small>
        </Card>
      )}
    </div>
  );
}
