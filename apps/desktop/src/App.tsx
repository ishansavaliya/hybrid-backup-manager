import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, WifiOff } from "lucide-react";
import type { AgentOverview } from "@bakvion/shared-types";
import { request } from "./api";
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
      setData(await request<AgentOverview>("overview"));
      setConnectionError(null);
    } catch (e) {
      setData(null);
      setConnectionError(toAppError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

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

  if (
    acct &&
    acct.mode === "signed_out" &&
    data &&
    (!plans.length || showSignIn)
  )
    return (
      <SignIn
        error={accountError}
        onSignIn={async (p) => {
          if (await account.signIn(p)) setShowSignIn(false);
        }}
        onCancel={plans.length ? () => setShowSignIn(false) : undefined}
      />
    );

  const header: Record<Tab, { title: string; subtitle: string }> = {
    overview: { title: t.overview.title, subtitle: t.overview.subtitle },
    plans: { title: t.plans.title, subtitle: t.plans.subtitle },
    restore: { title: t.restore.title, subtitle: t.restore.subtitle },
    history: { title: t.history.title, subtitle: t.history.subtitle },
    settings: { title: t.settings.title, subtitle: t.settings.subtitle },
  };
  const shownError = error ?? connectionError;

  return (
    <Shell
      tab={tab}
      onTab={setTab}
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
        {shownError ? (
          <Notice
            kind="error"
            onClose={error ? () => setError(null) : undefined}
            closeLabel={t.common.close}
          >
            {errorText(t, shownError)}
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
        {message ? (
          <Notice
            kind="ok"
            onClose={() => setMessage("")}
            closeLabel={t.common.close}
          >
            {message}
          </Notice>
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
                <Button variant="secondary" onClick={() => void refresh()}>
                  <RefreshCw size={15} aria-hidden="true" />
                  {t.disconnected.reconnect}
                </Button>
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
            onSync={account.syncNow}
            onSignOut={account.signOut}
            themePref={themePref}
            onThemePref={onThemePref}
            onRefreshService={() => void refresh()}
            kit={data?.kit}
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
