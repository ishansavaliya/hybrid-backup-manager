import { KeyRound, RefreshCw, Server } from "lucide-react";
import type { AccountStatus } from "@bakvion/shared-types";
import { AccountPanel } from "../account/AccountPanel";
import { LANG_NAME, LANGS, useI18n, type Lang } from "../i18n";
import type { ThemePref } from "../theme";
import { Button, Card, CardHeader, Field, Segmented } from "../ui";

export function Settings({
  status,
  accountError,
  onSync,
  onSignOut,
  themePref,
  onThemePref,
  onRefreshService,
}: {
  status: AccountStatus | null;
  accountError: string;
  onSync: () => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
  themePref: ThemePref;
  onThemePref: (p: ThemePref) => void;
  onRefreshService: () => void;
}) {
  const { t, lang, setLang } = useI18n();
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
          <CardHeader title={s.keysTitle} />
          <p className="gx-muted" style={{ display: "flex", gap: 10 }}>
            <KeyRound size={18} aria-hidden="true" style={{ flex: "none" }} />
            {s.keysBody}
          </p>
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
