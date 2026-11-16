import Link from "next/link";
import { downloadInfo } from "../../lib/server/release";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Download,
  HardDrive,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import {
  format,
  LANG_LABEL,
  LANG_NAME,
  LANGS,
  messages,
  type Lang,
} from "@bakvion/i18n";
import { EnquiryForm } from "./EnquiryForm";
import { devanagari, gujarati, manrope } from "./fonts";
import "./site.css";

const HREF: Record<Lang, string> = { en: "/", hi: "/hi", gu: "/gu" };

/** Renders <b>…</b> from translation strings without raw HTML. */
function rich(s: string): ReactNode[] {
  return s
    .split(/(<b>.*?<\/b>)/g)
    .map((part, i) =>
      part.startsWith("<b>") ? <b key={i}>{part.slice(3, -4)}</b> : part,
    );
}

function DownloadButton({
  label,
  soon,
  large,
  url,
}: {
  label: string;
  soon: string;
  large?: boolean;
  url?: string;
}) {
  const cls = `site-btn site-btn--primary${large ? " site-btn--lg" : ""}`;
  if (!url)
    return (
      <span className={`${cls} is-disabled`} aria-disabled="true">
        <Download size={18} aria-hidden="true" />
        {soon}
      </span>
    );
  return (
    <a className={cls} href={url} download>
      <Download size={18} aria-hidden="true" />
      {label}
    </a>
  );
}

export async function Landing({ lang }: { lang: Lang }) {
  const t = messages(lang);
  const download = await downloadInfo();
  const version = download?.version;
  const size = download?.size;
  const year = new Date().getFullYear();
  return (
    <div
      lang={lang}
      className={`site site--${lang} ${manrope.variable} ${devanagari.variable} ${gujarati.variable}`}
    >
      <nav className="site-nav" aria-label="Main">
        <div className="site-wrap site-nav__inner">
          <Link className="site-brand" href={HREF[lang]}>
            <span className="site-logo" aria-hidden="true" />
            Bakvion
          </Link>
          <div className="site-nav__links">
            <a href="#how">{t.nav.how}</a>
            <a href="#features">{t.nav.features}</a>
            <a href="#faq">{t.nav.faq}</a>
            <a href="#expert">{t.nav.expert}</a>
          </div>
          <div className="site-nav__right">
            <div className="site-lang" role="group" aria-label={t.nav.language}>
              {LANGS.map((l) => (
                <Link
                  key={l}
                  href={HREF[l]}
                  lang={l}
                  title={LANG_NAME[l]}
                  aria-current={l === lang ? "true" : undefined}
                >
                  {LANG_LABEL[l]}
                </Link>
              ))}
            </div>
            <a
              className="site-btn site-btn--primary site-btn--sm"
              href="#download"
            >
              <Download size={15} aria-hidden="true" />
              <span className="site-hide-sm">{t.nav.download}</span>
            </a>
          </div>
        </div>
      </nav>

      <header className="site-hero">
        <div className="site-wrap site-hero__inner">
          <div>
            <span className="site-eyebrow">
              <span className="site-dot" aria-hidden="true" />
              {t.hero.eyebrow}
            </span>
            <h1>
              {t.hero.title1}
              <br />
              <em>{t.hero.title2}</em>
            </h1>
            <p className="site-lead">{t.hero.lead}</p>
            <div className="site-cta" id="download">
              <DownloadButton
                url={download?.url}
                label={t.hero.download}
                soon={t.hero.comingSoon}
                large
              />
              <a
                className="site-btn site-btn--ghost site-btn--lg"
                href="#expert"
              >
                {t.hero.expert}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
            <p className="site-fine">
              <span>
                <b>{t.hero.requirements}</b>
              </span>
              {version ? (
                <span>{format(t.hero.version, { version })}</span>
              ) : null}
              {size ? <span>{format(t.hero.size, { size })}</span> : null}
            </p>
          </div>

          <div
            className="site-window"
            role="img"
            aria-label={t.illustration.label}
          >
            <div className="site-window__bar" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="site-window__body" aria-hidden="true">
              <div className="site-window__rail">
                <i className="on" />
                <i />
                <i />
                <i />
              </div>
              <div className="site-window__main">
                <div className="site-status">
                  <div className="site-ring">
                    <b>
                      <ShieldCheck size={20} />
                    </b>
                  </div>
                  <div>
                    <div className="site-ok">● {t.illustration.protected}</div>
                    <div className="site-strong">
                      {t.illustration.lastBackup}
                    </div>
                    <div className="site-muted site-small">
                      {t.illustration.next}
                    </div>
                  </div>
                </div>
                {[
                  t.illustration.plan1,
                  t.illustration.plan2,
                  t.illustration.plan3,
                ].map((p) => (
                  <div className="site-plan" key={p}>
                    <span>{p}</span>
                    <span className="site-pill">{t.illustration.done}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="how" className="site-section">
        <div className="site-wrap">
          <div className="site-head">
            <h2>{t.steps.title}</h2>
            <p>{t.steps.subtitle}</p>
          </div>
          <ol className="site-steps">
            {(
              [
                [t.steps.s1Title, t.steps.s1Text, t.steps.s1Time],
                [t.steps.s2Title, t.steps.s2Text, t.steps.s2Time],
                [t.steps.s3Title, t.steps.s3Text, t.steps.s3Time],
              ] as const
            ).map(([title, text, time], i) => (
              <li className="site-card site-step" key={title}>
                <span className="site-step__time">
                  <Timer size={13} aria-hidden="true" />
                  {time}
                </span>
                <span className="site-step__num">{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="site-section site-section--tight">
        <div className="site-wrap">
          <div className="site-head">
            <h2>{t.features.title}</h2>
          </div>
          <div className="site-features">
            {(
              [
                [RotateCcw, t.features.f1Title, t.features.f1Text],
                [Lock, t.features.f2Title, t.features.f2Text],
                [HardDrive, t.features.f3Title, t.features.f3Text],
                [Mail, t.features.f4Title, t.features.f4Text],
              ] as const
            ).map(([Icon, title, text]) => (
              <div className="site-card site-feature" key={title}>
                <span className="site-feature__icon" aria-hidden="true">
                  <Icon size={19} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section site-section--tight">
        <div className="site-wrap">
          <div className="site-band">
            <div>
              <h2>{t.where.title}</h2>
              <p>{t.where.subtitle}</p>
            </div>
            <ul className="site-where">
              <li>
                <span>{t.where.disk}</span>
                <span className="site-yes">
                  <Check size={16} aria-hidden="true" /> {t.where.yes}
                </span>
              </li>
              <li>
                <span>{t.where.drive}</span>
                <span className="site-yes">
                  <Check size={16} aria-hidden="true" /> {t.where.yes}
                </span>
              </li>
              <li>
                <span>{t.where.ours}</span>
                <span className="site-no">
                  <X size={16} aria-hidden="true" /> {t.where.never}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="site-section site-section--tight">
        <div className="site-wrap site-install">
          <div>
            <h2>{t.install.title}</h2>
            <p className="site-muted site-install__sub">{t.install.subtitle}</p>
            <ol className="site-install__steps">
              <li>{rich(t.install.step1)}</li>
              <li>{rich(t.install.step2)}</li>
              <li>{t.install.step3}</li>
            </ol>
          </div>
          <div className="site-smartscreen" aria-hidden="true">
            <p className="site-smartscreen__title">{t.install.shotTitle}</p>
            <p>{t.install.shotBody}</p>
            <p className="site-smartscreen__link">{t.install.moreInfo}</p>
            <span className="site-smartscreen__btn">{t.install.runAnyway}</span>
          </div>
        </div>
      </section>

      <section id="expert" className="site-section site-section--tight">
        <div className="site-wrap site-expert">
          <div className="site-expert__intro">
            <h2>{t.expert.title}</h2>
            <p>{t.expert.subtitle}</p>
          </div>
          <div className="site-card site-expert__card">
            <EnquiryForm t={t.expert} />
          </div>
        </div>
      </section>

      <section id="faq" className="site-section site-section--tight">
        <div className="site-wrap">
          <div className="site-head">
            <h2>{t.faq.title}</h2>
          </div>
          <div className="site-faq">
            {(
              [
                [t.faq.q1, t.faq.a1],
                [t.faq.q2, t.faq.a2],
                [t.faq.q3, t.faq.a3],
                [t.faq.q4, t.faq.a4],
              ] as const
            ).map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section site-section--tight">
        <div className="site-wrap">
          <div className="site-final">
            <h2>{t.final.title}</h2>
            <p>{t.final.subtitle}</p>
            <DownloadButton
              url={download?.url}
              label={t.hero.download}
              soon={t.hero.comingSoon}
              large
            />
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-wrap site-footer__inner">
          <span className="site-brand site-brand--sm">
            <span className="site-logo" aria-hidden="true" />
            Bakvion
          </span>
          <span>{t.footer.tagline}</span>
          <span>{format(t.footer.rights, { year })}</span>
        </div>
      </footer>
    </div>
  );
}
