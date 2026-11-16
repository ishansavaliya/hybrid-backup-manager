import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { ShieldCheck, X } from "lucide-react";
export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={clsx("button", className)} {...props} />;
}
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={clsx("card", className)} {...props} />;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <ShieldCheck size={25} />
      </span>
      <div>
        bakvion<span className="brand-tag">Your Data. Always Protected.</span>
      </div>
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description = "Configure a local encrypted, file-level backup.",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="muted">
            {description}
          </Dialog.Description>
          <Dialog.Close
            className="icon-button modal-close"
            aria-label="Close dialog"
          >
            <X size={18} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
