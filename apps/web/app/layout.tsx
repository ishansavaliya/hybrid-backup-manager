import type { Metadata } from "next";
import "@bakvion/ui/styles.css";
export const metadata: Metadata = {
  title: "Bakvion | Your Data. Always Protected.",
  description: "Secure backup management and recovery.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
