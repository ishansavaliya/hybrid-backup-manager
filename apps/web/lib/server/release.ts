// The newest published installer, read from the releases repo's latest.json
// (the same file the app's updater uses). Cached for an hour; when it can't
// be read the site falls back to the NEXT_PUBLIC_DOWNLOAD_* settings.

const RELEASES_REPO =
  process.env.RELEASES_REPO || "ishansavaliya/bakvion-releases";
const LATEST_JSON = `https://github.com/${RELEASES_REPO}/releases/latest/download/latest.json`;
/** Always the newest installer; GitHub redirects it to the current release. */
export const LATEST_INSTALLER = `https://github.com/${RELEASES_REPO}/releases/latest/download/Bakvion-Setup.exe`;

export interface Release {
  url: string;
  version: string;
  size: string;
}

export function formatSize(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export async function latestRelease(): Promise<Release | null> {
  try {
    const res = await fetch(LATEST_JSON, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const m = (await res.json()) as { version?: unknown; size?: unknown };
    if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+$/.test(m.version))
      return null;
    return {
      url: LATEST_INSTALLER,
      version: m.version,
      size: typeof m.size === "number" ? formatSize(m.size) : "",
    };
  } catch {
    return null;
  }
}

/** Download link and details: the published release first, then settings. */
export async function downloadInfo(): Promise<Release | null> {
  const release = await latestRelease();
  if (release) return release;
  const url = process.env.NEXT_PUBLIC_DOWNLOAD_URL;
  if (!url) return null;
  return {
    url,
    version: process.env.NEXT_PUBLIC_DOWNLOAD_VERSION || "",
    size: process.env.NEXT_PUBLIC_DOWNLOAD_SIZE || "",
  };
}
