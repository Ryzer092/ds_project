"use client";

import { CheckCircle2, CircleHelp, ExternalLink, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatTime, yen } from "@/lib/client/conditions-edit";
import type { CheckStatus, Offer } from "@/lib/schemas/offer";
import { cn } from "@/lib/utils";

const CTA_LABEL = { rakuten: "楽天市場で確認", amazon: "Amazonで確認" } as const;

export function priceText(offer: Offer): string {
  const p = offer.price;
  if (p.kind === "unknown" || p.amount === null) return "価格は販売ページで確認";
  if (p.kind === "from") return `${yen(p.amount)}から`;
  if (p.kind === "range") return p.maxAmount !== null ? `${yen(p.amount)}〜${yen(p.maxAmount)}` : `${yen(p.amount)}から`;
  return yen(p.amount);
}

function priceNotes(offer: Offer): string[] {
  const p = offer.price;
  const notes: string[] = [];
  notes.push(p.tax === "included" ? "税込" : p.tax === "excluded" ? "税別" : "税の扱いは未確認");
  notes.push(
    p.shipping === "included"
      ? "送料込み"
      : p.shipping === "excluded"
        ? p.shippingAmount !== null
          ? `送料${yen(p.shippingAmount)}`
          : "送料別（金額は未確認）"
        : "送料は未確認",
  );
  if (p.kind === "range") notes.push("選ぶ仕様によって価格が異なります");
  return notes;
}

const VERDICT = {
  verified: { label: "確認できた", variant: "success" as const },
  needs_check: { label: "要確認", variant: "warning" as const },
  mismatch: { label: "条件と異なる", variant: "danger" as const },
};

const CONDITION_LABEL = { new: "新品", used: "中古", refurbished: "整備品", unknown: "状態は未確認" } as const;
const AVAILABILITY_LABEL = { in_stock: "購入可能と表示", out_of_stock: "在庫切れと表示", unknown: "在庫は未確認" } as const;

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="確認できた" />;
  if (status === "fail") return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="条件と異なる" />;
  return <CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" aria-label="要確認" />;
}

type Props = { offer: Offer; sourceLabel: string; onOutbound: () => void };

/**
 * 商品カード。表示する事実はAPIの取得値と定型の判定説明だけ。
 * 自社で購入・予約したような表示はしない。リンク先はその情報源の該当商品ページのみ。
 */
export function OfferCard({ offer, sourceLabel, onOutbound }: Props) {
  const verdict = VERDICT[offer.evaluation.verdict];
  const unknownChecks = offer.evaluation.checks.filter((c) => c.status === "unknown");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex gap-3">
          {offer.imageUrl && (
            // 画像は許可ホストのURLを直接表示し、保存・再配信しない。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.imageUrl}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-24 shrink-0 rounded-md border object-contain"
            />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={verdict.variant}>{verdict.label}</Badge>
              <span className="text-xs text-muted-foreground">出典：{sourceLabel}</span>
            </div>
            <h4 className="break-words text-sm font-medium leading-snug">{offer.title}</h4>
            {offer.sellerName && <p className="text-xs text-muted-foreground">販売：{offer.sellerName}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <p className="text-lg font-semibold">
            {priceText(offer)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">（{formatTime(offer.retrievedAt)} 時点）</span>
          </p>
          <p className="text-xs text-muted-foreground">{priceNotes(offer).join("・")}</p>
          <p className="text-xs text-muted-foreground">
            {CONDITION_LABEL[offer.condition]}・{AVAILABILITY_LABEL[offer.availability]}
          </p>
          {offer.evaluation.confirmedTotalJpy !== null && (
            <p className="text-xs">確認できた総額：{yen(offer.evaluation.confirmedTotalJpy)}</p>
          )}
        </div>

        {offer.evaluation.checks.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label="条件の確認結果">
            {offer.evaluation.checks.map((c) => (
              <li key={c.id} className="flex gap-2 text-sm">
                <StatusIcon status={c.status} />
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="text-muted-foreground">：{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {offer.evaluation.verdict === "needs_check" && unknownChecks.length > 0 && (
          <p className="text-xs text-muted-foreground">
            販売ページで確認が必要：{unknownChecks.map((c) => c.label).join("、")}
          </p>
        )}

        <div>
          {offer.outboundUrl && !offer.demo ? (
            <a
              href={offer.outboundUrl}
              target="_blank"
              rel={cn("noopener noreferrer", offer.affiliate && "sponsored")}
              onClick={onOutbound}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {CTA_LABEL[offer.sourceId]}
              <ExternalLink className="size-4" aria-hidden />
              <span className="sr-only">（新しいタブで開きます）</span>
            </a>
          ) : (
            <span className="inline-flex h-10 items-center rounded-md border px-4 text-sm text-muted-foreground" aria-disabled>
              デモ商品のため購入できません
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
