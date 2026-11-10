import {
  Manrope,
  Noto_Sans_Devanagari,
  Noto_Sans_Gujarati,
} from "next/font/google";

export const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--site-latin",
  display: "swap",
});

export const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600", "700"],
  variable: "--site-devanagari",
  display: "swap",
});

export const gujarati = Noto_Sans_Gujarati({
  subsets: ["gujarati"],
  weight: ["400", "600", "700"],
  variable: "--site-gujarati",
  display: "swap",
});
