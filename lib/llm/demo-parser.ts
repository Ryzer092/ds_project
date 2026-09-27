import type { CategoryConfig } from "@/lib/categories";
import { findColorMention } from "@/lib/search/colors";
import { LIMITS } from "@/lib/schemas/limits";
import type { RequiredCondition, WishConditions } from "@/lib/schemas/wish";
import type { ConditionExtractor, ExtractionInput, ExtractionResult } from "./types";

/**
 * デモ用の簡易解析（ルールベース、AIは使わない）。
 * SEARCH_MODE=demo で ANTHROPIC_API_KEY が未設定の場合だけ使い、画面にもその旨を表示する。
 * 現在の条件を起点に、言及された条件だけを更新・解除する。
 */
export function parseDemoMessage(input: ExtractionInput): Omit<Extract<ExtractionResult, { ok: true }>, "usage"> {
  const { category, today } = input;
  const text = input.message.normalize("NFKC");
  const next: WishConditions = structuredClone(input.current);
  const notes: string[] = ["デモ用の簡易解析で読み取りました（AIは使用していません）。"];
  const changed: string[] = [];

  // 範囲判定
  const lower = text.toLowerCase();
  const productType = [...category.productTypes].sort((a, b) => b.length - a.length).find((t) => text.includes(t));
  const mentionsCategory = Boolean(productType) || category.inScopeTerms.some((t) => lower.includes(t.toLowerCase()));
  const hasExisting = input.current.productType !== null || input.current.required.length > 0 || input.current.budgetJpy !== null;
  const outOfScopeWords = ["椅子", "チェア", "ソファ", "ベッド", "冷蔵庫", "テレビ", "パソコン本体", "ノートパソコン", "服", "靴"];
  const mentionsOther = outOfScopeWords.some((w) => text.includes(w)) && !mentionsCategory;
  if (mentionsOther) {
    return emptyResult(next, false, notes);
  }
  if (productType) {
    next.productType = productType === "机" ? category.defaultKeyword : productType;
    changed.push(`商品種類: ${next.productType}`);
  } else if (mentionsCategory && !next.productType) {
    next.productType = category.defaultKeyword;
  }

  // 予算
  if (/予算(を|は)?(解除|なし|気にしない|指定しない)/.test(text)) {
    next.budgetJpy = null;
    next.budgetScope = "unspecified";
    changed.push("予算: 解除");
  } else {
    const man = text.match(/(\d+(?:\.\d+)?)\s*万\s*円?/);
    const yen = text.match(/(\d{1,3}(?:,\d{3})+|\d{3,})\s*円/);
    const amount = man ? Math.round(Number(man[1]) * 10000) : yen ? Number(yen[1].replaceAll(",", "")) : null;
    if (amount !== null && amount >= 1 && amount <= LIMITS.budgetMaxJpy) {
      next.budgetJpy = amount;
      changed.push(`予算: ${amount.toLocaleString("ja-JP")}円`);
    }
  }
  if (/送料込|送料を?含め|送料込み/.test(text)) next.budgetScope = "delivered_total";
  else if (/本体(価格)?(のみ|だけ)|送料別/.test(text)) next.budgetScope = "item";
  else if (next.budgetJpy !== null && input.current.budgetJpy === null && next.budgetScope === "unspecified") {
    next.budgetScope = "unspecified";
  }

  // 寸法
  for (const attr of category.attributes) {
    if (attr.kind !== "dimension") continue;
    const labels = [...attr.textLabels].sort((a, b) => b.length - a.length).join("|");
    if (new RegExp(`(${labels})(の条件)?(を|は)?(解除|指定しない|気にしない)`).test(text)) {
      next.required = next.required.filter((r) => r.key !== attr.key);
      changed.push(`${attr.label}: 解除`);
      continue;
    }
    const m = text.match(
      new RegExp(`(?:${labels})(?:は|を|が)?\\s*(?:約)?\\s*(\\d+(?:\\.\\d+)?)\\s*(cm|センチ|mm|m)?\\s*(以内|まで|以下|未満|以上|より大きい|くらい|程度|ぐらい)?`),
    );
    if (!m) continue;
    const unit = m[2] === "mm" ? "mm" : m[2] === "m" ? "m" : "cm";
    const op: RequiredCondition["op"] = /以上|より大きい/.test(m[3] ?? "") ? "gte" : /以内|まで|以下|未満/.test(m[3] ?? "") ? "lte" : "eq";
    const value = Number(m[1]) * (unit === "mm" ? 0.1 : unit === "m" ? 100 : 1);
    if (value < attr.min || value > attr.max) {
      notes.push(`${attr.label}の値（${m[1]}${m[2] ?? ""}）は対応範囲外のため採用しませんでした。`);
      continue;
    }
    next.required = next.required.filter((r) => !(r.key === attr.key && (r.op === op || op === "eq" || r.op === "eq")));
    next.required.push({ key: attr.key, op, value: Math.round(value * 10) / 10, unit: "cm" });
    changed.push(`${attr.label}: ${value}cm${op === "lte" ? "以内" : op === "gte" ? "以上" : ""}`);
  }

  // 色
  if (/色(の条件)?(を|は)?(解除|指定しない|気にしない|問わない)/.test(text)) {
    next.required = next.required.filter((r) => r.key !== "color");
    changed.push("色: 解除");
  } else {
    const color = findColorMention(text);
    if (color && category.attributes.some((a) => a.key === "color")) {
      const exclude = new RegExp(`${color}以外|(白|黒|ホワイト|ブラック)以外`).test(text);
      next.required = next.required.filter((r) => !(r.key === "color" && r.op === (exclude ? "exclude" : "eq")));
      next.required.push({ key: "color", op: exclude ? "exclude" : "eq", value: color, unit: null });
      changed.push(`色: ${color}${exclude ? "以外" : ""}`);
    }
  }

  // 機能
  const feature = category.attributes.find((a) => a.key === "feature");
  if (feature?.kind === "text") {
    for (const s of feature.suggestions) {
      if (text.includes(s) && !next.required.some((r) => r.key === "feature" && r.value === s)) {
        next.required.push({ key: "feature", op: "contains", value: s, unit: null });
        changed.push(`特徴: ${s}`);
      }
    }
  }

  // 状態
  if (/中古でも|中古可|状態は問わない/.test(text)) next.condition = "any";
  else if (/新品/.test(text)) next.condition = "new";
  else if (/中古/.test(text)) next.condition = "used";

  // 数量
  const qty = text.match(/(\d+)\s*(台|個|点|脚)/);
  if (qty) {
    const q = Number(qty[1]);
    if (q >= 1 && q <= LIMITS.quantityMax) next.quantity = q;
  }

  // 希望時期
  const wanted = parseWantedBy(text, today);
  if (wanted === "clear") next.wantedBy = null;
  else if (wanted) next.wantedBy = wanted;

  // 用途
  const purpose = text.match(/(在宅勤務|テレワーク|勉強|学習|仕事|ゲーム|子ども|子供)(用|向け|で使う)/);
  if (purpose) next.purpose = `${purpose[1]}用`;

  next.required = next.required.slice(0, LIMITS.requiredMax);
  const inScope = mentionsCategory || hasExisting;
  const needsClarification = inScope && !next.productType && !mentionsCategory;

  return {
    ok: true,
    inScope,
    conditions: next,
    keywords: [],
    clarifications: needsClarification ? [`どのような${category.label}をお探しですか？`] : [],
    needsClarificationBeforeSearch: needsClarification,
    reply: changed.length > 0 ? `条件を更新しました（${changed.join("、")}）。` : "条件は変更していません。",
    notes,
  };
}

function emptyResult(conditions: WishConditions, inScope: boolean, notes: string[]) {
  return {
    ok: true as const,
    inScope,
    conditions,
    keywords: [],
    clarifications: [],
    needsClarificationBeforeSearch: false,
    reply: null,
    notes,
  };
}

/** 「来月まで」「今月中」「10月15日まで」「2026-11-01まで」などを YYYY-MM-DD にする。 */
export function parseWantedBy(text: string, today: string): string | "clear" | null {
  if (/(時期|期限|納期)(は|を)?(解除|いつでも|問わない)/.test(text)) return "clear";
  const [y, m] = today.split("-").map(Number);
  const endOfMonth = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  if (/来月(まで|中|末)/.test(text)) {
    const nm = m === 12 ? 1 : m + 1;
    return endOfMonth(m === 12 ? y + 1 : y, nm);
  }
  if (/今月(まで|中|末)/.test(text)) return endOfMonth(y, m);
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})\s*まで/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const md = text.match(/(\d{1,2})月(\d{1,2})日\s*(まで|までに)/);
  if (md) {
    const mm = Number(md[1]);
    const dd = Number(md[2]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const yy = mm < m || (mm === m && dd < Number(today.split("-")[2])) ? y + 1 : y;
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    if (dt.getUTCMonth() !== mm - 1) return null;
    return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

export class DemoParserExtractor implements ConditionExtractor {
  readonly kind = "demo_parser" as const;

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    return { ...parseDemoMessage(input), usage: { calls: 0, inputTokens: 0, outputTokens: 0 } };
  }
}

export function isInScopeText(text: string, category: CategoryConfig): boolean {
  const t = text.normalize("NFKC").toLowerCase();
  return category.inScopeTerms.some((w) => t.includes(w.toLowerCase())) || category.productTypes.some((p) => t.includes(p));
}
