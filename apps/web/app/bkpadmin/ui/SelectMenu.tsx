"use client";

import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "./cx";
import { useGxContainer } from "./useGxContainer";

export interface SelectOption {
  /** Must not be an empty string (Radix reserves it). */
  value: string;
  label: string;
}

/**
 * Graphite dropdown (Radix Select) replacing the browser's native select.
 * With `name` it also submits inside a normal form.
 */
export function SelectMenu({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const container = useGxContainer();
  return (
    <RS.Root
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
    >
      <RS.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cx("gx-input gx-selectmenu", className)}
      >
        <span className="gx-selectmenu__value">
          <RS.Value placeholder={placeholder} />
        </span>
        <RS.Icon className="gx-selectmenu__icon">
          <ChevronDown size={16} aria-hidden="true" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal container={container ?? undefined}>
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
