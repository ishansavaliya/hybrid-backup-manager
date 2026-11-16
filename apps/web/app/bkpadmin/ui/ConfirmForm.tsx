"use client";

import { useId, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";
import { Dialog } from "./Dialog";

/**
 * A server-action form whose submit asks for confirmation in a dialog first.
 * `fields` are the hidden inputs the action needs.
 */
export function ConfirmForm({
  action,
  fields,
  trigger,
  triggerVariant = "danger",
  title,
  description,
  confirmLabel,
  size = "md",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  size?: "sm" | "md";
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  return (
    <form id={formId} action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        variant={triggerVariant}
        size={size}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} width={440}>
        <div className="gx-dialog__body">
          <p className="gx-muted">{description}</p>
        </div>
        <footer className="gx-dialog__foot">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={triggerVariant} type="submit" form={formId}>
            {confirmLabel}
          </Button>
        </footer>
      </Dialog>
    </form>
  );
}
