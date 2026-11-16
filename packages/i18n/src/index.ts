import en from "./en.json";
import gu from "./gu.json";
import hi from "./hi.json";

export const LANGS = ["en", "hi", "gu"] as const;
export type Lang = (typeof LANGS)[number];

/** English is the source of truth; other files must have the same keys. */
export type Messages = typeof en;

const ALL: Record<Lang, Messages> = { en, hi, gu };

export const LANG_LABEL: Record<Lang, string> = {
  en: "EN",
  hi: "हि",
  gu: "ગુ",
};

export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
};

export function messages(lang: Lang): Messages {
  return ALL[lang];
}

export function isLang(v: string): v is Lang {
  return (LANGS as readonly string[]).includes(v);
}

/** Replaces `{name}` placeholders. */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in values ? String(values[k]) : m,
  );
}
