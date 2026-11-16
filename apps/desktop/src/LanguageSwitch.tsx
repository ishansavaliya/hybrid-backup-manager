import { LANG_LABEL, LANG_NAME, LANGS, useI18n } from "./i18n";

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="gx-topbar__lang" role="group" aria-label={t.top.language}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={LANG_NAME[l]}
          aria-pressed={l === lang}
          onClick={() => setLang(l)}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
