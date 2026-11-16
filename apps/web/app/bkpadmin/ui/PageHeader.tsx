import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Small inline items next to the title (e.g. a status badge). */
  meta?: ReactNode;
}) {
  return (
    <div className="gx-page-header">
      <div className="gx-page-header__text">
        {back ? (
          <Link href={back.href} className="gx-page-header__back">
            <ArrowLeft size={15} aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="gx-page-header__title">
          {title}
          {meta ? <span className="gx-page-header__meta">{meta}</span> : null}
        </h1>
        {subtitle ? (
          <p className="gx-page-header__subtitle">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="gx-page-header__actions">{actions}</div>
      ) : null}
    </div>
  );
}
