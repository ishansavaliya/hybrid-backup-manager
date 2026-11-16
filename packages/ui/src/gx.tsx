// Graphite pop-ups shared by the desktop app (portal into the `.gx` root so
// they inherit theme tokens).
import { useEffect, useState, type ReactNode } from "react";
import * as RD from "@radix-ui/react-dialog";
import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown, X } from "lucide-react";

export function useGxRoot(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.querySelector<HTMLElement>(".gx")), []);
  return el;
}

export function GxDialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel = "Close",
  width = 640,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel?: string;
  width?: number;
  children: ReactNode;
}) {
  const root = useGxRoot();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal container={root ?? undefined}>
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
            <RD.Close className="gx-dialog__close" aria-label={closeLabel}>
              <X size={18} aria-hidden="true" />
            </RD.Close>
          </header>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export interface GxOption {
  value: string;
  label: string;
}

export function GxSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
}: {
  id?: string;
  value?: string;
  onValueChange: (value: string) => void;
  options: GxOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const root = useGxRoot();
  return (
    <RS.Root
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <RS.Trigger
        id={id}
        aria-label={ariaLabel}
        className="gx-input gx-selectmenu"
      >
        <span className="gx-selectmenu__value">
          <RS.Value placeholder={placeholder} />
        </span>
        <RS.Icon className="gx-selectmenu__icon">
          <ChevronDown size={16} aria-hidden="true" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal container={root ?? undefined}>
        <RS.Content
          className="gx-selectmenu__content"
          position="popper"
          sideOffset={6}
        >
          <RS.Viewport className="gx-selectmenu__viewport">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value}
                className="gx-selectmenu__item"
              >
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="gx-selectmenu__check">
                  <Check size={15} aria-hidden="true" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
