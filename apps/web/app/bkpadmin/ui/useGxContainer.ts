"use client";

import { useEffect, useState } from "react";

/**
 * The Graphite root element. Pop-ups (dialogs, select menus) portal into it so
 * they inherit the `.gx` tokens and the current light/dark theme.
 */
export function useGxContainer(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.querySelector<HTMLElement>(".gx"));
  }, []);
  return el;
}
