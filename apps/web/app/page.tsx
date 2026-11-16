import type { Metadata } from "next";
import { messages } from "@bakvion/i18n";
import { Landing } from "./(site)/Landing";

const t = messages("en").meta;

export const metadata: Metadata = {
  title: t.title,
  description: t.description,
  alternates: { languages: { en: "/", hi: "/hi", gu: "/gu" } },
  openGraph: { title: t.title, description: t.description, type: "website" },
};

export default function Home() {
  return <Landing lang="en" />;
}
