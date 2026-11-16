import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  block?: boolean;
  /** Square, icon-only button (give it an aria-label). */
  iconOnly?: boolean;
  className?: string;
  children?: ReactNode;
}

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type AsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | "href"> & {
    href: string;
  };

export type ButtonProps = AsButton | AsLink;

export function buttonClass({
  variant = "primary",
  size = "md",
  block,
  iconOnly,
  className,
}: CommonProps): string {
  return cx(
    "gx-btn",
    `gx-btn--${variant}`,
    size === "sm" && "gx-btn--sm",
    block && "gx-btn--block",
    iconOnly && "gx-btn--icon",
    className,
  );
}

/**
 * Graphite button. Pass `href` to render a Next.js `Link` styled as a button.
 * Defaults to `type="button"` so it never submits a form by accident; use
 * `type="submit"` explicitly for form submits.
 */
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, block, iconOnly, className, href, ...rest } = props;
    return (
      <Link
        href={href}
        className={buttonClass({ variant, size, block, iconOnly, className })}
        {...rest}
      />
    );
  }
  const {
    variant,
    size,
    block,
    iconOnly,
    className,
    type = "button",
    ...rest
  } = props;
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, iconOnly, className })}
      {...rest}
    />
  );
}
