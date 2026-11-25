import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { Toasts } from "@/components/Toasts";
import { SessionProvider } from "@/lib/session";
import { TOKEN_KEY } from "@/lib/storage";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

const description = "Plan sessions and matches, track player attendance, and manage club finances with MyClub.";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "MyClub | Club Management Assistant",
  description,
  robots: { index: true, follow: true },
  openGraph: {
    title: "MyClub | Club Management Assistant",
    description,
    type: "website",
    siteName: "MyClub",
  },
  twitter: {
    card: "summary_large_image",
    title: "MyClub | Club Management Assistant",
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${geist.className}`}>
        <Script id="mc-auth-flag" strategy="beforeInteractive">
          {`try{if(localStorage.getItem(${JSON.stringify(TOKEN_KEY)}))document.documentElement.classList.add("mc-auth");if(localStorage.getItem("mc-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`}
        </Script>
        <style>{`.lp-auth-hold{display:none}html.mc-auth .lp-auth-hold{display:block}html.mc-auth .lp-guest{display:none}`}</style>
        <SessionProvider>
          {children}
          <Toasts />
        </SessionProvider>
      </body>
    </html>
  );
}
