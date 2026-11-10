import { Download, KeyRound, RefreshCw, Server } from "lucide-react";
import type { AccountStatus, KitStatus } from "@bakvion/shared-types";
import { AccountPanel } from "../account/AccountPanel";
import { choose, request } from "../api";
import { format, LANG_NAME, LANGS, useI18n, type Lang } from "../i18n";
import type { ThemePref } from "../theme";
import { Button, Card, CardHeader, Field, Notice, Segmented } from "../ui";

export function Settings({
  status,
  accountError,
  onSync,
  onSignOut,
  themePref,
  onThemePref,
  onRefreshService,
  kit,
  busy,
  act,
  notify,
}: {
  status: AccountStatus | null;
  accountError: string;
  onSync: () => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
  themePref: ThemePref;
  onThemePref: (p: ThemePref) => void;
  onRefreshService: () => void;
  kit: KitStatus | undefined;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  notify: (m: string) => void;
}) {
  const { t, lang, setLang, dateTime } = useI18n();
  const s = t.settings;
  return (
    <div className="gx-two">
      <div className="gx-stack">
        {status ? (
          <AccountPanel
            status={status}
            error={accountError}
            onSync={onSync}
            onSignOut={onSignOut}
          />
        ) : null}
        <Card>
          <CardHeader
            title={s.keysTitle}
            actions={
              <Button
                variant={kit?.needed ? "primary" : "secondary"}
                size="sm"
                disabled={busy || !kit}
                onClick={() =>
                  void act(async () => {
                    const directory = await choose(true);
                    if (!directory) return;
                    const r = await request<{ path: string }>(
                      "exportRecoveryKit",
                      { directory },
                    );
                    notify(format(s.kitDone, { path: r.path }));
                  })
                }
              >
                <Download size={14} aria-hidden="true" />
                {s.kitSave}
              </Button>
            }
          />
          <div style={{ display: "grid", gap: 12 }}>
            {kit?.needed ? <Notice kind="error">{s.kitNeeded}</Notice> : null}
            <p
              className="gx-muted"
              style={{ display: "flex", gap: 10, margin: 0 }}
            >
              <KeyRound size={18} aria-hidden="true" style={{ flex: "none" }} />
              {s.keysBody}
            </p>
            {kit?.savedAt ? (
              <p className="gx-hint" style={{ margin: 0 }}>
                {format(s.kitSaved, { date: dateTime(kit.savedAt) })}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
      <div className="gx-stack">
        <Card>
          <CardHeader title={s.appearance} />
          <div className="gx-form">
            <Field label={s.theme} htmlFor="st-theme">
              <div id="st-theme">
                <Segmented<ThemePref>
                  label={s.theme}
                  value={themePref}
                  onChange={onThemePref}
                  options={[
                    { key: "system", label: s.themeSystem },
                    { key: "light", label: s.themeLight },
                    { key: "dark", label: s.themeDark },
                  ]}
                />
              </div>
            </Field>
            <Field label={s.language} htmlFor="st-lang">
              <div id="st-lang">
                <Segmented<Lang>
                  label={s.language}
                  value={lang}
                  onChange={setLang}
                  options={LANGS.map((l) => ({ key: l, label: LANG_NAME[l] }))}
                />
              </div>
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader
            title={s.service}
            actions={
              <Button variant="secondary" size="sm" onClick={onRefreshService}>
                <RefreshCw size={14} aria-hidden="true" />
                {s.refresh}
              </Button>
            }
          />
          <p className="gx-muted" style={{ display: "flex", gap: 10 }}>
            <Server size={18} aria-hidden="true" style={{ flex: "none" }} />
            {s.serviceBody}
          </p>
        </Card>
      </div>
    </div>
  );
}
