import type { Metadata, Viewport } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The masthead face: condensed and heavy, like a cover logo.
const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comics.inchipala.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Comics",
  appleWebApp: { capable: true, title: "Comics", statusBarStyle: "default" },
  description: BRAND.tagline,
  // The link preview: the card (opengraph-image.tsx) and, where previews play video, a page being made from words to paint, on a loop.
  openGraph: {
    title: "Comics",
    description: BRAND.tagline,
    type: "website",
    videos: [{ url: new URL("/comics-loop.mp4", SITE).toString(), type: "video/mp4", width: 1280, height: 720 }], // (videos are not resolved against metadataBase)
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f4f2",
  // Draw under the notch and home bar; the UI pads itself with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
