/**
 * 紹介サイトの計測。送るのはイベント種別と、CTAの位置（固定値）だけ。
 * クリックを利用開始・購入とは扱わない。失敗しても画面遷移を妨げない。
 */
export type MarketingEventType = "landing_view" | "demo_cta_click" | "demo_started";

export function sendMarketingEvent(type: MarketingEventType, placement?: "header" | "hero" | "preview" | "footer") {
  try {
    const body = JSON.stringify({ type, clientEventId: crypto.randomUUID(), placement: placement ?? null });
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/events", blob)) return;
    void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    // 計測の失敗は無視する
  }
}
