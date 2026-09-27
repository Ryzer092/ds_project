/** 呼び出し元の中断と個別タイムアウトの両方で止まる fetch。キャッシュは常に無効。 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([signal, timeout]),
  });
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

/** 商品説明のHTMLをテキストにする。照合専用で、画面にHTMLとして出さない。 */
export function stripHtml(input: unknown, maxChars = 5000): string {
  if (typeof input !== "string") return "";
  return input
    .slice(0, maxChars * 2)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxChars);
}

/** 表示用の短いテキスト。HTMLタグは除去し、Reactでテキストとして描画する。 */
export function displayText(input: unknown, maxChars = 200): string {
  return stripHtml(input, maxChars).replace(/\s+/g, " ").trim();
}

export async function sleep(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
