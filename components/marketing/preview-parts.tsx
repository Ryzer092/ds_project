import { Check, CircleHelp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SampleCandidate } from "@/config/marketing";

/**
 * 画面サンプル用の部品。説明のための静的な表示で、入力欄・送信・保存などの操作要素を持たない。
 * 商品図は自作の簡素なSVG。実店舗の画像や各社ロゴは使わない。
 */
export function DeskIllustration({ variant = "a", className }: { variant?: "a" | "b"; className?: string }) {
  return (
    <svg viewBox="0 0 120 80" role="img" aria-label="デスクのイラスト" className={className}>
      <rect width="120" height="80" rx="10" fill="#F3F8F1" />
      {variant === "a" ? (
        <g stroke="#142B1E" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="22" y="30" width="76" height="7" rx="2" fill="#FFFFFF" />
          <path d="M28 37v28M92 37v28" />
          <path d="M28 58h64" strokeWidth="1.6" opacity="0.5" />
        </g>
      ) : (
        <g stroke="#142B1E" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="18" y="28" width="84" height="7" rx="2" fill="#FFFFFF" />
          <path d="M24 35v30M96 35v30" />
          <rect x="62" y="35" width="28" height="12" rx="2" fill="#FFFFFF" />
          <path d="M72 41h8" />
        </g>
      )}
    </svg>
  );
}

export function UserBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-mk-primary px-4 py-3 text-[15px] leading-relaxed text-white", className)}>
      {children}
    </div>
  );
}

export function AiBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex max-w-[92%] items-start gap-2.5", className)}>
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-mk-surface text-mk-primary">
        <Sparkles className="size-3.5" aria-hidden />
      </span>
      <div className="rounded-2xl rounded-tl-md border border-mk-line bg-white px-4 py-3 text-[15px] leading-relaxed text-mk-ink">
        {children}
      </div>
    </div>
  );
}

export function ConditionChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "changed" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm",
        tone === "default" && "border-mk-line bg-white text-mk-ink",
        tone === "changed" && "border-mk-primary/40 bg-mk-surface font-medium text-mk-primary",
        tone === "muted" && "border-mk-line bg-white text-mk-muted line-through decoration-mk-muted/60",
      )}
    >
      {children}
    </span>
  );
}

export function CheckRow({ label, status }: { label: string; status: "pass" | "unknown" }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {status === "pass" ? (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-mk-primary/10 text-mk-primary">
          <Check className="size-3.5" aria-hidden />
        </span>
      ) : (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <CircleHelp className="size-3.5" aria-hidden />
        </span>
      )}
      <span className="text-mk-ink">{label}</span>
      <span className={cn("ml-auto shrink-0 text-xs", status === "pass" ? "text-mk-primary" : "text-amber-800")}>
        {status === "pass" ? "確認できた" : "要確認"}
      </span>
    </li>
  );
}

export function CandidateCard({ candidate, variant }: { candidate: SampleCandidate; variant: "a" | "b" }) {
  const unknowns = candidate.checks.filter((c) => c.status === "unknown");
  return (
    <div className="flex gap-4 rounded-2xl border border-mk-line bg-white p-4">
      <DeskIllustration variant={variant} className="h-20 w-[120px] shrink-0 max-[420px]:h-16 max-[420px]:w-24" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-mk-ink">{candidate.name}</p>
        <p className="text-sm text-mk-muted">{candidate.spec}</p>
        <p className="text-base font-semibold text-mk-ink">{candidate.price}</p>
        <p className="text-xs text-mk-muted">{candidate.shipping}</p>
        {unknowns.length > 0 && (
          <p className="mt-1 inline-flex w-fit items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
            <CircleHelp className="size-3" aria-hidden />
            要確認：{unknowns.map((u) => u.label.replace(/（.*）/, "")).join("・")}
          </p>
        )}
      </div>
    </div>
  );
}

/** 画面イメージであることの共通注記。 */
export function SampleNote({ className }: { className?: string }) {
  return <p className={cn("text-xs text-mk-muted", className)}>画面イメージ・架空のサンプル商品です</p>;
}
