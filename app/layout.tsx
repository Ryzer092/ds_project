import type { Metadata, Viewport } from "next";
import { getSiteMetadataBase } from "@/config/marketing";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteMetadataBase(),
  title: { default: "Next AI Agent", template: "%s｜Next AI Agent" },
  applicationName: "Next AI Agent",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** 紹介サイト（/）とアプリ（/app 以下）で layout を分ける。ここは共通の html/body だけ。 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
