"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { sendMarketingEvent } from "@/lib/client/marketing-events";
import { cn } from "@/lib/utils";
import type { DemoPlacement } from "@/config/marketing";

type Props = {
  /** buildDemoHref で作ったURL（サーバー側の信頼済み設定から構成）。 */
  href: string;
  placement: DemoPlacement;
  ready: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "inverse";
  className?: string;
  /** 準備中の理由（ready=false の場合に表示）。 */
  pendingReason?: string;
};

const sizes = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-7 text-base",
};

/**
 * 「デモを試す」の共通リンク。全CTAがこのコンポーネントと同じ demoUrl を使う。
 * 同じタブで直接遷移し、クリック計測に失敗しても遷移は妨げない。
 * デモが準備できていない場合は、クリックできるように見せず「デモ準備中」と理由を示す。
 */
export function DemoLink({
  href,
  placement,
  ready,
  label = "デモを試す",
  size = "md",
  variant = "primary",
  className,
  pendingReason = "体験版を開発中です。",
}: Props) {
  if (!ready) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-[10px] border border-dashed border-mk-muted/50 font-medium text-mk-muted",
          sizes[size],
          className,
        )}
      >
        デモ準備中<span className="sr-only">：{pendingReason}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={() => sendMarketingEvent("demo_cta_click", placement)}
      className={cn(
        "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-colors",
        variant === "primary"
          ? "bg-mk-primary text-white hover:bg-mk-primary-hover"
          : "bg-white text-mk-deep hover:bg-mk-surface",
        sizes[size],
        className,
      )}
    >
      {label}
      <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
