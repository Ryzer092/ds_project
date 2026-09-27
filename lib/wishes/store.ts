import type { SupabaseClient } from "@supabase/supabase-js";
import type { Feedback, FeedbackInput } from "@/lib/schemas/feedback";
import { WishConditionsSchema, type PurchaseWish, type WishConditions, type WishStatus } from "@/lib/schemas/wish";

export type CreateResult = { ok: true; wish: PurchaseWish } | { ok: false; code: "limit" | "invalid" };
export type UpdateResult =
  | { ok: true; wish: PurchaseWish }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "conflict"; current: PurchaseWish };
export type FeedbackResult = { ok: true; feedback: Feedback } | { ok: false; code: "not_found" | "version_not_found" };

/**
 * 本人の購入希望の保存先。実装は本人の認証コンテキストで動作し、
 * 所有権はRLS（DB）で強制される。userId は呼び出し側から受け取らない。
 */
export interface WishStore {
  list(): Promise<PurchaseWish[]>;
  get(id: string): Promise<PurchaseWish | null>;
  create(conditions: WishConditions): Promise<CreateResult>;
  updateConditions(id: string, expectedVersion: number, conditions: WishConditions): Promise<UpdateResult>;
  updateStatus(id: string, status: WishStatus): Promise<PurchaseWish | null>;
  touchSearched(id: string): Promise<void>;
  remove(id: string): Promise<boolean>;
  listFeedback(wishId: string): Promise<Feedback[]>;
  addFeedback(wishId: string, input: FeedbackInput): Promise<FeedbackResult>;
}

type WishRow = {
  id: string;
  user_id: string;
  version: number;
  title: string;
  category_id: string;
  product_type: string | null;
  purpose: string | null;
  budget_jpy: number | null;
  budget_scope: PurchaseWish["budgetScope"];
  quantity: number;
  condition: PurchaseWish["condition"];
  required: unknown;
  preferences: unknown;
  wanted_by: string | null;
  status: WishStatus;
  last_searched_at: string | null;
  created_at: string;
  updated_at: string;
};

type FeedbackRow = {
  id: string;
  wish_id: string;
  wish_version: number;
  outcome: Feedback["outcome"];
  purchased_from: Feedback["purchasedFrom"];
  skip_reasons: Feedback["skipReasons"];
  comment: string | null;
  source_id: Feedback["sourceId"];
  created_at: string;
};

const WISH_COLUMNS =
  "id,user_id,version,title,category_id,product_type,purpose,budget_jpy,budget_scope,quantity,condition,required,preferences,wanted_by,status,last_searched_at,created_at,updated_at";
const FEEDBACK_COLUMNS = "id,wish_id,wish_version,outcome,purchased_from,skip_reasons,comment,source_id,created_at";

export function rowToWish(row: WishRow): PurchaseWish {
  // DBの値も境界で検証する（想定外の値を画面に流さない）。
  const conditions = WishConditionsSchema.parse({
    title: row.title,
    categoryId: row.category_id,
    productType: row.product_type,
    purpose: row.purpose,
    budgetJpy: row.budget_jpy,
    budgetScope: row.budget_scope,
    quantity: row.quantity,
    condition: row.condition,
    required: row.required,
    preferences: row.preferences,
    wantedBy: row.wanted_by,
  });
  return {
    ...conditions,
    id: row.id,
    userId: row.user_id,
    version: row.version,
    status: row.status,
    lastSearchedAt: row.last_searched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function conditionsToRow(c: WishConditions) {
  return {
    title: c.title,
    category_id: c.categoryId,
    product_type: c.productType,
    purpose: c.purpose,
    budget_jpy: c.budgetJpy,
    budget_scope: c.budgetScope,
    quantity: c.quantity,
    condition: c.condition,
    required: c.required,
    preferences: c.preferences,
    wanted_by: c.wantedBy,
  };
}

function rowToFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    wishId: row.wish_id,
    wishVersion: row.wish_version,
    outcome: row.outcome,
    purchasedFrom: row.purchased_from,
    skipReasons: row.skip_reasons ?? [],
    comment: row.comment,
    sourceId: row.source_id,
    createdAt: row.created_at,
  };
}

export class SupabaseWishStore implements WishStore {
  constructor(private readonly db: SupabaseClient) {}

  async list() {
    const { data, error } = await this.db
      .from("purchase_wishes")
      .select(WISH_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`list failed: ${error.code}`);
    return (data as WishRow[]).map(rowToWish);
  }

  async get(id: string) {
    const { data, error } = await this.db.from("purchase_wishes").select(WISH_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(`get failed: ${error.code}`);
    return data ? rowToWish(data as WishRow) : null;
  }

  async create(conditions: WishConditions): Promise<CreateResult> {
    // user_id はDBの既定値 auth.uid() とトリガーで本人に固定される。
    const { data, error } = await this.db
      .from("purchase_wishes")
      .insert(conditionsToRow(conditions))
      .select(WISH_COLUMNS)
      .single();
    if (error) {
      if (error.message?.includes("wish_limit_reached")) return { ok: false, code: "limit" };
      if (error.code === "23514") return { ok: false, code: "invalid" };
      throw new Error(`create failed: ${error.code}`);
    }
    return { ok: true, wish: rowToWish(data as WishRow) };
  }

  async updateConditions(id: string, expectedVersion: number, conditions: WishConditions): Promise<UpdateResult> {
    // 楽観ロック: 期待する版の行だけ更新する。版はトリガーで進む。
    const { data, error } = await this.db
      .from("purchase_wishes")
      .update(conditionsToRow(conditions))
      .eq("id", id)
      .eq("version", expectedVersion)
      .select(WISH_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`update failed: ${error.code}`);
    if (data) return { ok: true, wish: rowToWish(data as WishRow) };
    const current = await this.get(id);
    if (!current) return { ok: false, code: "not_found" };
    return { ok: false, code: "conflict", current };
  }

  async updateStatus(id: string, status: WishStatus) {
    const { data, error } = await this.db
      .from("purchase_wishes")
      .update({ status })
      .eq("id", id)
      .select(WISH_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`status failed: ${error.code}`);
    return data ? rowToWish(data as WishRow) : null;
  }

  async touchSearched(id: string) {
    await this.db.from("purchase_wishes").update({ last_searched_at: new Date().toISOString() }).eq("id", id);
  }

  async remove(id: string) {
    const { data, error } = await this.db.from("purchase_wishes").delete().eq("id", id).select("id");
    if (error) throw new Error(`delete failed: ${error.code}`);
    return (data ?? []).length > 0;
  }

  async listFeedback(wishId: string) {
    const { data, error } = await this.db
      .from("feedback")
      .select(FEEDBACK_COLUMNS)
      .eq("wish_id", wishId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`feedback list failed: ${error.code}`);
    return (data as FeedbackRow[]).map(rowToFeedback);
  }

  async addFeedback(wishId: string, input: FeedbackInput): Promise<FeedbackResult> {
    const wish = await this.get(wishId);
    if (!wish) return { ok: false, code: "not_found" };
    const { data: rev } = await this.db
      .from("wish_revisions")
      .select("version")
      .eq("wish_id", wishId)
      .eq("version", input.wishVersion)
      .maybeSingle();
    if (!rev) return { ok: false, code: "version_not_found" };
    const { data, error } = await this.db
      .from("feedback")
      .insert({
        wish_id: wishId,
        wish_version: input.wishVersion,
        outcome: input.outcome,
        purchased_from: input.purchasedFrom,
        skip_reasons: input.skipReasons,
        comment: input.comment,
        source_id: input.sourceId,
      })
      .select(FEEDBACK_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23503" || error.code === "42501") return { ok: false, code: "not_found" };
      throw new Error(`feedback failed: ${error.code}`);
    }
    return { ok: true, feedback: rowToFeedback(data as FeedbackRow) };
  }
}
