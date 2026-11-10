// The service writes run notes in English, one per line; show them in the
// chosen language. Unknown notes are shown as they are.
import { format, type AppText } from "./i18n";

export type NoteTone = "neutral" | "warning";

export function runNotes(
  t: AppText,
  notes: string | undefined,
): { text: string; tone: NoteTone; raw: string }[] {
  const h = t.history;
  return (notes ?? "")
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      if (raw === "Old versions cleaned up")
        return { text: h.cleaned, tone: "neutral", raw };
      if (raw.startsWith("Cleanup skipped"))
        return { text: h.cleanupSkipped, tone: "warning", raw };
      if (raw.startsWith("Backed up without a Windows snapshot"))
        return { text: h.noShadow, tone: "warning", raw };
      if (raw.startsWith("Windows snapshot unavailable"))
        return { text: h.shadowFailed, tone: "warning", raw };
      if (raw.startsWith("Some files could not be read"))
        return { text: h.unreadable, tone: "warning", raw };
      let m = /^Backup disk is (\d+)% full \((.+) free\)$/.exec(raw);
      if (m)
        return {
          text: format(h.diskFull, { n: m[1]!, free: m[2]! }),
          tone: "warning",
          raw,
        };
      m = /^Backup disk found at (.+) \(was (.+)\)$/.exec(raw);
      if (m)
        return {
          text: format(h.relocated, { now: m[1]!, was: m[2]! }),
          tone: "neutral",
          raw,
        };
      return { text: raw, tone: "neutral", raw };
    });
}

/** "12.3 GB" */
export const gigabytes = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
