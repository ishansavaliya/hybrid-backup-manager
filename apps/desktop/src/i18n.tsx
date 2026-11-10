import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  format,
  isLang,
  LANG_LABEL,
  LANG_NAME,
  LANGS,
  messages,
  type Lang,
  type Messages,
} from "@bakvion/i18n";

export type AppText = Messages["app"];
export { format, LANG_LABEL, LANG_NAME, LANGS, type Lang };

const KEY = "bakvion-lang";
const LOCALE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };

/** Saved choice, else the Windows display language, else English. */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && isLang(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : "en";
}

interface I18n {
  lang: Lang;
  t: AppText;
  setLang: (l: Lang) => void;
  /** Date + time in the chosen language. */
  dateTime: (iso: string) => string;
  /** Date only in the chosen language. */
  date: (iso: string) => string;
  /** "12 minutes ago", "in 3 days"… in the chosen language. */
  relative: (iso: string) => string;
  /** "1 day" / "{n} days". */
  days: (n: number) => string;
  /** "today" / "1 day ago" / "{n} days ago". */
  daysAgo: (n: number) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* storage blocked */
    }
  }, []);
  const value = useMemo<I18n>(() => {
    const t = messages(lang).app;
    const locale = LOCALE[lang];
    const dt = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const d = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return {
      lang,
      t,
      setLang,
      dateTime: (iso) => dt.format(new Date(iso)),
      date: (iso) => d.format(new Date(iso)),
      relative: (iso) => {
        const diff = (new Date(iso).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        if (abs < 60) return rtf.format(Math.round(diff), "second");
        if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
        return rtf.format(Math.round(diff / 86400), "day");
      },
      daysAgo: (n) => (n <= 0 ? t.common.today : rtf.format(-n, "day")),
      days: (n) =>
        n === 1 ? t.membership.day : format(t.membership.days, { n }),
    };
  }, [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
