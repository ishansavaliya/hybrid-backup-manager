import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Card({
  flush,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  /** No inner padding (for tables that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section
      className={cx("gx-card", flush && "gx-card--flush", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  titleId,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Id for the heading, to label the card with aria-labelledby. */
  titleId?: string;
}) {
  return (
    <header className="gx-card-header">
      <div className="gx-card-header__text">
        <h2 id={titleId} className="gx-card-header__title">
          {title}
        </h2>
        {description ? (
          <p className="gx-card-header__desc">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="gx-card-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
