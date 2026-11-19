import { useCallback, useEffect, useState } from "react";
import { Play, Plus, RefreshCw, WifiOff } from "lucide-react";
import type { AgentOverview } from "@bakvion/shared-types";
import { request, startService } from "./api";
import { useAccount } from "./account/useAccount";
import { SignIn } from "./account/SignIn";
import { MembershipBadge } from "./account/MembershipBadge";
import { SyncIndicator } from "./account/SyncIndicator";
import { RestoreOnlyNotice } from "./account/RestoreOnlyNotice";
import { errorText, toAppError, type AppError } from "./account/messages";
import { I18nProvider, useI18n } from "./i18n";
import { useTheme } from "./theme";
import { Shell, type Tab } from "./Shell";
import { Button, Card, EmptyState, Notice, PageHeader } from "./ui";
import { Overview } from "./screens/Overview";
import { Plans } from "./screens/Plans";
import { PlanWizard } from "./screens/PlanWizard";
import { Restore } from "./screens/Restore";
import { HistoryTable } from "./screens/History";
import { Settings } from "./screens/Settings";

export default function App() {
  return (
    <I18nProvider>
      <Root />
    </I18nProvider>
  );
}

function Root() {
  const { lang } = useI18n();
  const { pref, theme, setPref } = useTheme();
  return (
    <div className="gx" data-theme={theme} lang={lang}>
      <Main
        theme={theme}
        themePref={pref}
        onThemePref={setPref}
        onToggleTheme={() => setPref(theme === "dark" ? "light" : "dark")}
      />
    </div>
  );
}

function Main({
  theme,
  themePref,
  onThemePref,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  themePref: ReturnType<typeof useTheme>["pref"];
  onThemePref: ReturnType<typeof useTheme>["setPref"];
  onToggleTheme: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<AgentOverview | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [connectionError, setConnectionError] = useState<AppError | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const account = useAccount();

  const refresh = useCallback(async () => {
    try {
      const next = await request<AgentOverview>("overview");
      setData(next);
      setConnectionError(null);
      return next;
    } catch (e) {
      setData(null);
      setConnectionError(toAppError(e));
      return null;
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
    if (!message) return;
    const tmr = setTimeout(() => setMessage(""), 5500);
    return () => clearTimeout(tmr);
  }, [message]);
  useEffect(() => {
    if (!error) return;
    const tmr = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(tmr);
  }, [error]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(false);
    }
  }

  const plans = data?.plans ?? [];
  const acct = account.status;
  const paused = !acct || acct.mode !== "full";
  const accountError = errorText(t, account.error);
  const signedOut = acct
    ? acct.mode === "signed_out"
    : data?.status.mode === "signed_out";

  if (signedOut && data && (!plans.length || showSignIn))
    return (
      <SignIn
        error={accountError}
        onSignIn={async (p) => {
          if (await account.signIn(p)) setShowSignIn(false);
        }}
        onCancel={plans.length ? () => setShowSignIn(false) : undefined}
      />
    );

  if (loading && "__TAURI_INTERNALS__" in window) return null;

  const header: Record<Tab, { title: string; subtitle: string }> = {
    overview: { title: t.overview.title, subtitle: t.overview.subtitle },
    plans: { title: t.plans.title, subtitle: t.plans.subtitle },
    restore: { title: t.restore.title, subtitle: t.restore.subtitle },
    history: { title: t.history.title, subtitle: t.history.subtitle },
    settings: { title: t.settings.title, subtitle: t.settings.subtitle },
  };
  return (
    <Shell
      tab={tab}
      onTab={(next) => {
        setTab(next);
        setError(null);
        setMessage("");
      }}
      connected={!!data}
      theme={theme}
      onToggleTheme={onToggleTheme}
      badges={
        acct ? (
          <>
            <SyncIndicator status={acct} />
            <MembershipBadge status={acct} />
          </>
        ) : null
      }
    >
      <div className="gx-stack">
        <PageHeader
          title={header[tab].title}
          subtitle={header[tab].subtitle}
          actions={
            tab === "overview" || tab === "plans" ? (
              <Button
                onClick={() => setWizard(true)}
                disabled={!data || busy || paused}
              >
                <Plus size={16} aria-hidden="true" />
                {t.overview.createPlan}
              </Button>
            ) : null
          }
        />
        {connectionError ? (
          <Notice kind="error" closeLabel={t.common.close}>
            {errorText(t, connectionError)}
          </Notice>
        ) : null}
        {acct && paused ? (
          <RestoreOnlyNotice
            status={acct}
            error={accountError}
            onSync={account.syncNow}
            onSignIn={() => setShowSignIn(true)}
          />
        ) : null}

        {loading ? (
          <Card>
            <p className="gx-muted" role="status">
              {t.disconnected.connecting}
            </p>
          </Card>
        ) : !data ? (
          <Card>
            <EmptyState
              icon={<WifiOff size={20} />}
              title={t.disconnected.title}
              action={
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  {"__TAURI_INTERNALS__" in window ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await startService();
                          const res = await refresh();
                          if (res) {
                            await account.reload();
                            setMessage(
                              `BakvionService started (v${res.status.version}).`,
                            );
                          }
                        })
                      }
                    >
                      <Play size={15} aria-hidden="true" />
                      Start service
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => void refresh()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    {t.disconnected.reconnect}
                  </Button>
                </div>
              }
            >
              {t.disconnected.body}
            </EmptyState>
            <p className="gx-hint" style={{ textAlign: "center" }}>
              {t.disconnected.browser}
            </p>
          </Card>
        ) : (
          <>
            {tab === "overview" && (
              <Overview
                data={data}
                paused={paused}
                busy={busy}
                onCreatePlan={() => setWizard(true)}
                onGo={setTab}
                onBackupAll={() =>
                  void act(async () => {
                    const running = new Set(
                      data.executions
                        .filter(
                          (j) => j.state === "running" || j.state === "queued",
                        )
                        .map((j) => j.planId),
                    );
                    for (const p of plans)
                      if (!running.has(p.id) && !p.restoreOnly)
                        await request("startBackup", { planId: p.id });
                    setMessage(t.overview.queuedAll);
                  })
                }
              />
            )}
            {tab === "plans" && (
              <Plans
                data={data}
                paused={paused}
                busy={busy}
                act={act}
                notify={setMessage}
                onCreatePlan={() => setWizard(true)}
              />
            )}
            {tab === "restore" && (
              <Restore
                plans={plans}
                busy={busy}
                act={act}
                notify={setMessage}
              />
            )}
            {tab === "history" && (
              <Card flush>
                <HistoryTable plans={plans} jobs={data.executions} />
              </Card>
            )}
          </>
        )}
        {tab === "settings" && (
          <Settings
            status={acct}
            accountError={accountError}
            onSync={async () => {
              const ok = await account.syncNow();
              if (ok) {
                setError(null);
                setMessage("Account synced successfully.");
              }
              return ok;
            }}
            onSignOut={account.signOut}
            themePref={themePref}
            onThemePref={onThemePref}
            serviceConnected={!!data}
            onStartService={() =>
              void act(async () => {
                await startService();
                const res = await refresh();
                if (res) {
                  await account.reload();
                  setMessage(
                    `BakvionService started (v${res.status.version}).`,
                  );
                } else {
                  setError({
                    code: "SERVICE_OFF",
                    message:
                      "BakvionService could not start. Check Windows Services.",
                  });
                }
              })
            }
            onRefreshService={async () => {
              const res = await refresh();
              if (res) {
                setError(null);
                setMessage(
                  `BakvionService is running (v${res.status.version}).`,
                );
              } else {
                setMessage("");
                setError({
                  code: "SERVICE_OFF",
                  message:
                    "BakvionService is not running. Start BakvionService in Windows Services.",
                });
              }
            }}
            kit={data?.kit}
            serviceVersion={data?.status.version ?? acct?.appVersion ?? ""}
            busy={busy}
            act={act}
            notify={setMessage}
          />
        )}
        <div className="gx-foot">
          <span>{t.footer}</span>
          <span>Bakvion {data?.status.version ?? acct?.appVersion ?? ""}</span>
        </div>
      </div>
      {error || message ? (
        <div className="gx-toast-wrap" aria-live="polite">
          {error ? (
            <Notice
              kind="error"
              onClose={() => setError(null)}
              closeLabel={t.common.close}
            >
              {errorText(t, error)}
            </Notice>
          ) : null}
          {message ? (
            <Notice
              kind="ok"
              onClose={() => setMessage("")}
              closeLabel={t.common.close}
            >
              {message}
            </Notice>
          ) : null}
        </div>
      ) : null}
      <PlanWizard
        open={wizard}
        close={() => setWizard(false)}
        save={async (p) => {
          await request("savePlan", p);
          await refresh();
          setTab("plans");
        }}
      />
    </Shell>
  );
}
