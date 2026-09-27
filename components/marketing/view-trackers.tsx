"use client";

import { useEffect, useRef } from "react";
import { sendMarketingEvent } from "@/lib/client/marketing-events";

/** 紹介ページの表示を1回だけ記録する（失敗しても表示に影響しない）。 */
export function LandingViewTracker() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    sendMarketingEvent("landing_view");
  }, []);
  return null;
}
