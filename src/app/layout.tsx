import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { LOCK_BOOT_SCRIPT } from "@/lib/lock-boot";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Atlas",
  description: "Ton patrimoine, traduit en choses que l'on comprend sans réfléchir.",
  appleWebApp: { capable: true, title: "Atlas", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06070b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        {/* Voile la page avant tout affichage quand Face ID verrouille l'app : rien ne transparaît. */}
        <script dangerouslySetInnerHTML={{ __html: LOCK_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
