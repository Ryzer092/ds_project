import type { SourceId } from "@/lib/schemas/offer";

/**
 * 外部リンク・画像URLの許可ホスト。情報源ごとに、その情報源の該当ページ・画像だけを許可する。
 * 任意URLへのリダイレクトは作らず、ここで検証したURLだけをクライアントへ渡す。
 */
const LINK_HOSTS: Record<SourceId, readonly string[]> = {
  rakuten: ["item.rakuten.co.jp", "hb.afl.rakuten.co.jp"],
  amazon: ["www.amazon.co.jp"],
};

const IMAGE_HOSTS: Record<SourceId, readonly string[]> = {
  rakuten: ["thumbnail.image.rakuten.co.jp"],
  amazon: ["m.media-amazon.com"],
};

function parseHttps(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  return url;
}

export function validateProductLink(sourceId: SourceId, raw: unknown): string | null {
  const url = parseHttps(raw);
  if (!url) return null;
  return LINK_HOSTS[sourceId].includes(url.hostname) ? url.toString() : null;
}

export function validateImageUrl(sourceId: SourceId, raw: unknown): string | null {
  const url = parseHttps(raw);
  if (!url) return null;
  return IMAGE_HOSTS[sourceId].includes(url.hostname) ? url.toString() : null;
}

export function isAllowedOutboundHost(sourceId: SourceId, raw: string): boolean {
  return validateProductLink(sourceId, raw) !== null;
}
