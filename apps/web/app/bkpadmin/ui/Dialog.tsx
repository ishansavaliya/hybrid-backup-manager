"use client";

import * as RD from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useGxContainer } from "./useGxContainer";

/** Graphite modal dialog (Radix): focus trap, Escape and outside click close it. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 680,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const container = useGxContainer();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal container={container ?? undefined}>
        <RD.Overlay className="gx-dialog-overlay" />
        <RD.Content
          className="gx-dialog"
          style={{ maxWidth: width }}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <header className="gx-dialog__head">
            <div className="gx-dialog__heading">
              <RD.Title className="gx-dialog__title">{title}</RD.Title>
              {description ? (
                <RD.Description className="gx-dialog__desc">
                  {description}
                </RD.Description>
              ) : null}
            </div>
            <RD.Close className="gx-dialog__close" aria-label="Close">
              <X size={18} aria-hidden="true" />
            </RD.Close>
          </header>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
