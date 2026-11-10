import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "@bakvion/ui/graphite.css";
import { themeScript } from "./ui/theme-script";

export const metadata: Metadata = {
  title: "Bakvion Admin",
  robots: { index: false, follow: false },
};

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The theme script sets data-theme on this root while the HTML is parsed,
    // so React sees an attribute it did not render: hence the suppression.
    <div className={`gx ${manrope.variable}`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      {children}
    </div>
  );
}
