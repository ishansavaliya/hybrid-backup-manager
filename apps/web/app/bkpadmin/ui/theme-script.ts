export const THEME_STORAGE_KEY = "bkp-admin-theme";

export type AdminTheme = "light" | "dark";

/**
 * Inline script placed as the first child of the `.gx` root. It runs while
 * the HTML is parsed, before the page paints, so a dark-mode visit never
 * flashes white: saved choice first, then the OS preference.
 */
export const themeScript = `(function(){try{var r=document.currentScript&&document.currentScript.parentElement;if(!r)return;var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}r.setAttribute("data-theme",t)}catch(e){}})();`;
