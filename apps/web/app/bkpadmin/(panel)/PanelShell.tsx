"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { History, Menu, Settings, UsersRound, X } from "lucide-react";
import { BrandMark, ThemeToggle } from "../ui";

const NAV = [
  { href: "/bkpadmin", label: "Clients", icon: UsersRound },
  { href: "/bkpadmin/history", label: "History", icon: History },
  { href: "/bkpadmin/settings", label: "Settings", icon: Settings },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/bkpadmin") {
    return pathname === "/bkpadmin" || pathname.startsWith("/bkpadmin/clients");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function areaTitle(pathname: string): string {
  if (pathname === "/bkpadmin/clients/new") return "New client";
  if (pathname.startsWith("/bkpadmin/clients/")) return "Client";
  return NAV.find((n) => isActive(n.href, pathname))?.label ?? "Admin";
}

/**
 * Admin chrome: narrow icon rail + top bar. Under 900 px the rail becomes a
 * slide-in menu opened from the top bar.
 */
export function PanelShell({
  adminName,
  signOut,
  children,
}: {
  adminName: string;
  signOut: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  // Close the menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="gx-shell">
      <aside
        id="gx-admin-nav"
        className="gx-rail"
        data-open={open}
        aria-label="Admin navigation"
      >
        <div className="gx-rail__head">
          <Link
            href="/bkpadmin"
            className="gx-rail__brand"
            aria-label="Bakvion admin home"
            title="Bakvion admin"
          >
            <BrandMark withName />
          </Link>
          <button
            type="button"
            className="gx-btn gx-btn--ghost gx-btn--icon gx-btn--sm gx-rail__close"
            aria-label="Close menu"
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="gx-nav">
          {NAV.map(({ href, label, icon: Icon }, i) => (
            <Link
              key={href}
              href={href}
              ref={i === 0 ? firstLink : undefined}
              className="gx-nav__item"
              aria-current={isActive(href, pathname) ? "page" : undefined}
            >
              <span className="gx-nav__icon">
                <Icon size={19} strokeWidth={2} aria-hidden="true" />
              </span>
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div
        className="gx-scrim"
        data-open={open}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <div className="gx-main">
        <header className="gx-topbar">
          <button
            ref={menuButton}
            type="button"
            className="gx-btn gx-btn--ghost gx-btn--icon gx-topbar__menu"
            aria-label="Open menu"
            aria-controls="gx-admin-nav"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="gx-topbar__title">{areaTitle(pathname)}</span>
          <div className="gx-topbar__actions">
            <ThemeToggle />
            <span className="gx-topbar__divider" aria-hidden="true" />
            <span className="gx-user" title={adminName}>
              <span className="gx-avatar" aria-hidden="true">
                {adminName.slice(0, 1) || "A"}
              </span>
              <span className="gx-user__name">{adminName}</span>
            </span>
            {signOut}
          </div>
        </header>
        <main className="gx-content">{children}</main>
      </div>
    </div>
  );
}
