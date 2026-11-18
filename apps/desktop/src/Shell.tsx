import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Database,
  History as HistoryIcon,
  LayoutDashboard,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useI18n } from "./i18n";
import { LanguageSwitch } from "./LanguageSwitch";

export type Tab = "overview" | "plans" | "restore" | "history" | "settings";

const NAV: { key: Tab; icon: typeof LayoutDashboard }[] = [
  { key: "overview", icon: LayoutDashboard },
  { key: "plans", icon: Database },
  { key: "restore", icon: ArrowDownToLine },
  { key: "history", icon: HistoryIcon },
  { key: "settings", icon: Settings },
];

export function Shell({
  tab,
  onTab,
  connected,
  theme,
  onToggleTheme,
  badges,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  connected: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  badges?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return (
    <div className="gx-shell gx-app">
      <aside className="gx-rail" aria-label={t.nav.main}>
        <div className="gx-rail__head">
          <span className="gx-rail__brand" title="Bakvion">
            <span className="gx-logo" aria-hidden="true" />
          </span>
        </div>
        <nav className="gx-nav">
          {NAV.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className="gx-nav__item"
              aria-current={tab === key ? "page" : undefined}
              onClick={() => onTab(key)}
            >
              <span className="gx-nav__icon">
                <Icon size={19} strokeWidth={2} aria-hidden="true" />
              </span>
              {t.nav[key]}
            </button>
          ))}
        </nav>
      </aside>
      <div className="gx-main">
        <header className="gx-topbar">
          <span className="gx-topbar__title">{t.nav[tab]}</span>
          <div className="gx-topbar__actions">
            {badges}
            <span className="gx-conn" data-ok={connected}>
              {connected ? t.top.connected : t.top.disconnected}
            </span>
            <span className="gx-topbar__divider" aria-hidden="true" />
            <span className="gx-conn" data-ok={online}>
              {online ? t.top.online : t.top.offline}
            </span>
            <span className="gx-topbar__divider" aria-hidden="true" />
            <LanguageSwitch />
            <button
              type="button"
              className="gx-btn gx-btn--ghost gx-btn--icon gx-btn--sm"
              aria-label={theme === "dark" ? t.top.light : t.top.dark}
              title={theme === "dark" ? t.top.light : t.top.dark}
              onClick={onToggleTheme}
            >
              {theme === "dark" ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </button>
          </div>
        </header>
        <main className="gx-content">{children}</main>
      </div>
    </div>
  );
}
