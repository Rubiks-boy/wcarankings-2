import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "CubeRanks — WCA rankings at your speed",
    description: "A fast, mobile-first explorer for every official World Cube Association ranking.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "CubeRanks — WCA rankings at your speed",
      description: "Explore every official WCA ranking with fast filters, infinite scroll, and instant jumps.",
      type: "website",
      url: metadataBase,
      images: [{ url: "/og.png", width: 1731, height: 909, alt: "CubeRanks — world rankings at your speed" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "CubeRanks — WCA rankings at your speed",
      description: "Every official WCA ranking. Zero digging.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
