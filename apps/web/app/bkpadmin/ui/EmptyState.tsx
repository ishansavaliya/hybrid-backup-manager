import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="gx-empty">
      <div className="gx-empty__icon" aria-hidden="true">
        {icon ?? <Inbox size={20} />}
      </div>
      <p className="gx-empty__title">{title}</p>
      {description ? <p className="gx-empty__desc">{description}</p> : null}
      {action ? <div className="gx-empty__action">{action}</div> : null}
    </div>
  );
}
