"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type AdminTheme } from "./theme-script";

function root(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".gx");
}

function currentTheme(): AdminTheme {
  const set = root()?.getAttribute("data-theme");
  if (set === "dark" || set === "light") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Light / dark switch. The knob position comes from CSS on the `.gx` root,
 * so it is right even before React hydrates; the choice is saved in
 * localStorage and re-applied before paint by the theme script.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<AdminTheme | null>(null);

  useEffect(() => {
    const t = currentTheme();
    // Make sure the root carries the theme even after a client-side
    // navigation into the admin area (the inline script only runs on load).
    root()?.setAttribute("data-theme", t);
    setTheme(t);
  }, []);

  function toggle() {
    const next: AdminTheme = currentTheme() === "dark" ? "light" : "dark";
    root()?.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the switch still works for this page.
    }
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="gx-theme-toggle"
      onClick={toggle}
    >
      <Sun className="gx-theme-toggle__sun" size={14} aria-hidden="true" />
      <Moon className="gx-theme-toggle__moon" size={14} aria-hidden="true" />
    </button>
  );
}
