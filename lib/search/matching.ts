import { findAttribute, type CategoryConfig } from "@/lib/categories";
import type {
  CheckStatus,
  ConditionCheck,
  NormalizedOffer,
  Offer,
  OfferEvaluation,
  OfferPrice,
} from "@/lib/schemas/offer";
import type { RequiredCondition, WishConditions } from "@/lib/schemas/wish";
import { findColorsInText } from "./colors";
import { readDimension } from "./dimensions";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;
const cm = (n: number) => `${n}cm`;

/** 寸法の「同じ」とみなす許容差（cm）。 */
const EQ_TOLERANCE_CM = 1;

/**
 * 候補を条件と照合する。すべて通常コードで判定し、商品情報が不足する部分は unknown とする。
 */
export function evaluateOffer(
  normalized: NormalizedOffer,
  conditions: WishConditions,
  category: CategoryConfig,
): Offer {
  const { offer, matchText } = normalized;
  const checks: ConditionCheck[] = [];

  const budget = checkBudget(offer.price, conditions);
  if (budget.check) checks.push(budget.check);

  if (conditions.quantity > 1) {
    checks.push({
      id: "quantity",
      label: "数量",
      status: "unknown",
      detail: `${conditions.quantity}点分の在庫・購入可否は販売ページで確認してください。`,
    });
  }

  if (conditions.condition !== "any") {
    checks.push(checkCondition(offer.condition, conditions.condition));
  }

  conditions.required.forEach((req, i) => {
    const c = checkRequired(req, i, matchText, category);
    if (c) checks.push(c);
  });

  checks.push(checkAvailability(offer.availability));

  if (conditions.wantedBy) {
    checks.push({
      id: "wanted_by",
      label: "お届け時期",
      status: "unknown",
      detail: `${formatDate(conditions.wantedBy)}までに届くかは検索結果から確認できません。販売ページの配送予定を確認してください。`,
    });
  }

  const evaluation: OfferEvaluation = {
    verdict: verdictOf(checks),
    checks,
    confirmedTotalJpy: budget.confirmedTotal,
  };
  return { ...offer, evaluation };
}

export function verdictOf(checks: ConditionCheck[]): OfferEvaluation["verdict"] {
  if (checks.some((c) => c.status === "fail")) return "mismatch";
  if (checks.every((c) => c.status === "pass")) return "verified";
  return "needs_check";
}

// ---------------------------------------------------------------------------
// 予算
// ---------------------------------------------------------------------------

/**
 * 予算判定。
 * - 送料・税・数量が確認できる場合だけ総額を計算する。不明な送料を0円にしない。
 * - 「送料込み予算」と本体価格だけの一致を区別する。
 * - ポイントやクーポンは差し引かない。
 */
export function checkBudget(
  price: OfferPrice,
  conditions: WishConditions,
): { check: ConditionCheck | null; confirmedTotal: number | null } {
  const qty = conditions.quantity;
  const budget = conditions.budgetJpy;
  const confirmedTotal = confirmableTotal(price, qty);

  if (budget === null) return { check: null, confirmedTotal };

  const label = conditions.budgetScope === "delivered_total" ? "予算（送料込み）" : "予算";
  const qtyNote = qty > 1 ? `${qty}点分` : "";

  if (price.kind === "unknown" || price.amount === null) {
    return {
      check: { id: "budget", label, status: "unknown", detail: "価格を確認できませんでした。" },
      confirmedTotal,
    };
  }

  const minItemsTotal = price.amount * qty;
  const maxItemsTotal =
    price.kind === "exact" ? minItemsTotal : price.kind === "range" && price.maxAmount !== null ? price.maxAmount * qty : null;

  // 本体価格の最小値だけで予算を超える場合は、送料・税が不明でも条件と異なる。
  // 税別価格の場合も、税込額は本体価格以上になるため同様に判定できる。
  if (minItemsTotal > budget) {
    const what = price.kind === "exact" ? "本体価格" : "最低価格";
    return {
      check: {
        id: "budget",
        label,
        status: "fail",
        detail: `${what}${qtyNote}${yen(minItemsTotal)}が予算${yen(budget)}を超えています。`,
      },
      confirmedTotal,
    };
  }

  if (conditions.budgetScope === "delivered_total") {
    if (confirmedTotal !== null && price.kind === "exact") {
      return {
        check: {
          id: "budget",
          label,
          status: confirmedTotal <= budget ? "pass" : "fail",
          detail: `送料・税込みの総額${qtyNote}${yen(confirmedTotal)}（予算${yen(budget)}）。`,
        },
        confirmedTotal,
      };
    }
    const missing: string[] = [];
    if (price.kind !== "exact") missing.push(price.kind === "range" ? "選択する仕様の価格" : "確定価格");
    if (price.shipping !== "included" && price.shippingAmount === null) missing.push("送料");
    if (price.tax !== "included") missing.push("税込みかどうか");
    return {
      check: {
        id: "budget",
        label,
        status: "unknown",
        detail: `本体価格${qtyNote}は${yen(minItemsTotal)}${price.kind === "exact" ? "" : "から"}ですが、${missing.join("・")}を確認できないため送料込みの総額は未確定です。`,
      },
      confirmedTotal,
    };
  }

  // item / unspecified: 本体価格で判定
  if (maxItemsTotal !== null && maxItemsTotal <= budget) {
    const taxNote = price.tax === "excluded" ? "（税別価格。税込額は販売ページで確認）" : "";
    if (price.tax === "excluded") {
      return {
        check: {
          id: "budget",
          label,
          status: "unknown",
          detail: `本体価格${qtyNote}${yen(maxItemsTotal)}${taxNote}。`,
        },
        confirmedTotal,
      };
    }
    const shippingNote =
      price.shipping === "included" ? "送料込み" : price.shipping === "excluded" ? "送料別" : "送料は未確認";
    const scopeNote = conditions.budgetScope === "unspecified" ? "送料を含むかは指定なし。" : "";
    return {
      check: {
        id: "budget",
        label,
        status: "pass",
        detail: `本体価格${qtyNote}${yen(maxItemsTotal)}（${shippingNote}）。${scopeNote}`,
      },
      confirmedTotal,
    };
  }

  return {
    check: {
      id: "budget",
      label,
      status: "unknown",
      detail:
        price.kind === "range"
          ? `価格帯${yen(price.amount)}〜${price.maxAmount !== null ? yen(price.maxAmount) : ""}のため、選ぶ仕様によっては予算を超えます。`
          : `${yen(price.amount)}からの価格で、希望の仕様の価格は未確定です。`,
    },
    confirmedTotal,
  };
}

/** 送料・税・価格がすべて確定している場合だけ総額を返す。 */
export function confirmableTotal(price: OfferPrice, quantity: number): number | null {
  if (price.kind !== "exact" || price.amount === null) return null;
  if (price.tax !== "included") return null;
  if (price.shipping === "included") return price.amount * quantity;
  if (price.shipping === "excluded" && price.shippingAmount !== null && quantity === 1) {
    return price.amount + price.shippingAmount;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 状態・在庫
// ---------------------------------------------------------------------------

const CONDITION_LABEL = { new: "新品", used: "中古", refurbished: "整備品", unknown: "不明" } as const;

function checkCondition(
  offerCondition: Offer["condition"],
  wanted: Exclude<WishConditions["condition"], "any">,
): ConditionCheck {
  if (offerCondition === "unknown") {
    return {
      id: "condition",
      label: "状態",
      status: "unknown",
      detail: `${CONDITION_LABEL[wanted]}かどうかを検索結果から確認できません。`,
    };
  }
  const ok = offerCondition === wanted;
  return {
    id: "condition",
    label: "状態",
    status: ok ? "pass" : "fail",
    detail: ok
      ? `${CONDITION_LABEL[offerCondition]}（検索結果の表示）。`
      : `${CONDITION_LABEL[offerCondition]}として表示されています（希望：${CONDITION_LABEL[wanted]}）。`,
  };
}

function checkAvailability(availability: Offer["availability"]): ConditionCheck {
  switch (availability) {
    case "in_stock":
      return { id: "availability", label: "在庫", status: "pass", detail: "取得時点で購入可能と表示されています。" };
    case "out_of_stock":
      return { id: "availability", label: "在庫", status: "fail", detail: "取得時点で在庫切れと表示されています。" };
    default:
      return { id: "availability", label: "在庫", status: "unknown", detail: "在庫状況を確認できませんでした。" };
  }
}

// ---------------------------------------------------------------------------
// 必須条件（カテゴリ属性）
// ---------------------------------------------------------------------------

function checkRequired(
  req: RequiredCondition,
  index: number,
  text: { title: string; body: string },
  category: CategoryConfig,
): ConditionCheck | null {
  const attr = findAttribute(category, req.key);
  if (!attr) return null;
  const id = `required.${index}`;

  if (attr.kind === "dimension") {
    if (typeof req.value !== "number") return null;
    const target = req.value;
    const opLabel = req.op === "lte" ? `${cm(target)}以内` : req.op === "gte" ? `${cm(target)}以上` : `${cm(target)}`;
    const label = `${attr.label} ${opLabel}`;
    const reading = readDimension(text.title, text.body, attr);
    if (!reading) {
      return { id, label, status: "unknown", detail: `${attr.label}の記載を確認できませんでした。` };
    }
    const results: CheckStatus[] = [];
    for (const v of reading.values) results.push(compareNumber(v, req.op, target));
    for (const r of reading.ranges) results.push(compareRange(r, req.op, target));
    const where = reading.from === "title" ? "商品名" : "商品説明";
    const shown = [
      ...reading.values.map(cm),
      ...reading.ranges.map(([a, b]) => `${a}〜${b}cm`),
    ].join("・");
    if (results.every((r) => r === "pass")) {
      return { id, label, status: "pass", detail: `${where}に${attr.label}${shown}と記載されています。` };
    }
    if (results.every((r) => r === "fail")) {
      return { id, label, status: "fail", detail: `${where}に${attr.label}${shown}と記載されています。` };
    }
    return {
      id,
      label,
      status: "unknown",
      detail: `${where}に${attr.label}${shown}の記載があり、選ぶサイズや調節によって異なる可能性があります。`,
    };
  }

  if (attr.kind === "color") {
    if (typeof req.value !== "string") return null;
    const colors = findColorsInText(text.title);
    if (req.op === "exclude") {
      const label = `色 ${req.value}以外`;
      if (colors.length === 1 && colors[0] === req.value) {
        return { id, label, status: "fail", detail: `商品名に${req.value}と記載されています。` };
      }
      if (colors.length === 1) {
        return { id, label, status: "pass", detail: `商品名に${colors[0]}と記載されています。` };
      }
      return { id, label, status: "unknown", detail: colors.length > 1 ? "複数の色から選ぶ商品の可能性があります。" : "色の記載を確認できませんでした。" };
    }
    const label = `色 ${req.value}`;
    if (colors.length === 1 && colors[0] === req.value) {
      return { id, label, status: "pass", detail: `商品名に${req.value}と記載されています。` };
    }
    if (colors.length > 1 && colors.includes(req.value)) {
      return { id, label, status: "unknown", detail: `複数の色（${colors.join("・")}）の記載があり、選択式の可能性があります。` };
    }
    // 商品名のテキストだけでは脚や引き出しの色など部分的な記載の可能性があるため、違反とは断定しない。
    return {
      id,
      label,
      status: "unknown",
      detail: colors.length > 0 ? `商品名の色の記載は${colors.join("・")}です。販売ページで色を確認してください。` : "色の記載を確認できませんでした。",
    };
  }

  // text
  if (typeof req.value !== "string") return null;
  const needle = req.value.normalize("NFKC").toLowerCase();
  const haystack = `${text.title}\n${text.body}`.normalize("NFKC").toLowerCase();
  const found = haystack.includes(needle);
  if (req.op === "exclude") {
    const label = `${attr.label} 「${req.value}」を除く`;
    return found
      ? { id, label, status: "fail", detail: `商品情報に「${req.value}」と記載されています。` }
      : { id, label, status: "pass", detail: `商品名・説明に「${req.value}」の記載はありません。` };
  }
  const label = `${attr.label} 「${req.value}」`;
  return found
    ? { id, label, status: "pass", detail: `商品情報に「${req.value}」と記載されています。` }
    : { id, label, status: "unknown", detail: `「${req.value}」の記載を確認できませんでした。` };
}

function compareNumber(v: number, op: RequiredCondition["op"], target: number): CheckStatus {
  switch (op) {
    case "lte":
      return v <= target ? "pass" : "fail";
    case "gte":
      return v >= target ? "pass" : "fail";
    case "eq":
      return Math.abs(v - target) <= EQ_TOLERANCE_CM ? "pass" : "fail";
    default:
      return "unknown";
  }
}

/** 範囲はサイズ違いか調節範囲か区別できないため、全体が満たす/外れる場合だけ確定する。 */
function compareRange([a, b]: [number, number], op: RequiredCondition["op"], target: number): CheckStatus {
  switch (op) {
    case "lte":
      return b <= target ? "pass" : a > target ? "fail" : "unknown";
    case "gte":
      return a >= target ? "pass" : b < target ? "fail" : "unknown";
    case "eq":
      return target < a - EQ_TOLERANCE_CM || target > b + EQ_TOLERANCE_CM ? "fail" : "unknown";
    default:
      return "unknown";
  }
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}
