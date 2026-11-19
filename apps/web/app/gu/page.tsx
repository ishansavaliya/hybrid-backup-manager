import type { Metadata } from "next";
import { messages } from "@bakvion/i18n";
import { Landing } from "../(site)/Landing";

const t = messages("gu").meta;

export const metadata: Metadata = {
  title: t.title,
  description: t.description,
  alternates: { languages: { en: "/", hi: "/hi", gu: "/gu" } },
  openGraph: { title: t.title, description: t.description, type: "website" },
};

export const revalidate = 300;

export default function Page() {
  return <Landing lang="gu" />;
}
