"use client";

import { useEffect, useRef } from "react";
import { sendMarketingEvent } from "@/lib/client/marketing-events";

/** 紹介サイトから /app に到着したことを記録する（アプリ側で確認できる demo_started）。 */
export function DemoStartedTracker() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    sendMarketingEvent("demo_started");
  }, []);
  return null;
}
