import type { MetadataRoute } from "next";
import { getSiteMetadataBase, isMarketingIndexable } from "@/config/marketing";

/**
 * 公開ドメイン確定・公開判断（MARKETING_INDEXABLE=true かつ SITE_URL 設定）までは全体を noindex。
 * 公開後も、アプリ（検索・希望・設定・ログイン）と API はクロール対象にしない。
 */
export default function robots(): MetadataRoute.Robots {
  if (!isMarketingIndexable()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const base = getSiteMetadataBase();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/search", "/login", "/wishes", "/settings", "/api"] }],
    sitemap: base ? new URL("/sitemap.xml", base).toString() : undefined,
  };
}
