import { cx } from "./cx";

/** Saffron conic disc, the Bakvion mark in the Graphite design. */
export function BrandMark({
  size = "md",
  withName,
}: {
  size?: "sm" | "md";
  withName?: boolean;
}) {
  return (
    <>
      <span
        className={cx("gx-logo", size === "sm" && "gx-logo--sm")}
        aria-hidden="true"
      />
      {withName ? <span className="gx-wordmark">Bakvion</span> : null}
    </>
  );
}
