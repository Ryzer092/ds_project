/**
 * 許可済みイベントの送信。失敗しても画面操作や外部リンクへの遷移を妨げない。
 * 本文・価格・URLは送らない。
 */
export function sendEvent(type: "outbound_click" | "search_started" | "login_completed", sourceId?: "rakuten" | "amazon") {
  try {
    const body = JSON.stringify({ type, clientEventId: crypto.randomUUID(), sourceId: sourceId ?? null });
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/events", blob)) return;
    void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    // 計測の失敗は無視する
  }
}
