import { z } from "zod";
import { parseConditions, WISH_STATUSES } from "@/lib/schemas/wish";
import { BodyTooLargeError, isSameOrigin, jsonError, jsonOk, readJson, UUID_RE } from "@/lib/server/http";
import { recordUsageEvent } from "@/lib/server/ops-log";
import { requireWishContext } from "@/lib/wishes/context";
import { buildWishTitle } from "@/lib/wishes/title";

const PatchSchema = z.union([
  z.object({ expectedVersion: z.number().int().min(1), conditions: z.unknown() }).strict(),
  z.object({ status: z.enum(WISH_STATUSES) }).strict(),
]);

type Ctx = { params: Promise<{ id: string }> };

async function wishId(ctx: Ctx) {
  const { id } = await ctx.params;
  return UUID_RE.test(id) ? id : null;
}

export async function GET(_request: Request, context: Ctx) {
  const id = await wishId(context);
  if (!id) return jsonError(404, "not_found", "希望が見つかりません。");
  const ctx = await requireWishContext();
  if (ctx instanceof Response) return ctx;
  const wish = await ctx.store.get(id);
  // 他人の希望は存在しないものとして扱う（RLSで取得できない）。
  if (!wish) return jsonError(404, "not_found", "希望が見つかりません。");
  const feedback = await ctx.store.listFeedback(id);
  return jsonOk({ wish, feedback });
}

export async function PATCH(request: Request, context: Ctx) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");
  const id = await wishId(context);
  if (!id) return jsonError(404, "not_found", "希望が見つかりません。");
  const ctx = await requireWishContext();
  if (ctx instanceof Response) return ctx;

  let raw: unknown;
  try {
    raw = await readJson(request);
  } catch (e) {
    return jsonError(e instanceof BodyTooLargeError ? 413 : 400, "invalid_json", "入力を読み取れませんでした。");
  }
  const body = PatchSchema.safeParse(raw);
  if (!body.success) return jsonError(400, "invalid_request", "入力が不正です。");

  if ("status" in body.data) {
    const wish = await ctx.store.updateStatus(id, body.data.status);
    if (!wish) return jsonError(404, "not_found", "希望が見つかりません。");
    return jsonOk({ wish });
  }

  const parsed = parseConditions(body.data.conditions);
  if (!parsed.ok) return jsonError(400, "invalid_conditions", "条件の指定が不正です。", { issues: parsed.issues });
  const conditions = { ...parsed.value, title: parsed.value.title || buildWishTitle(parsed.value) };
  const result = await ctx.store.updateConditions(id, body.data.expectedVersion, conditions);
  if (!result.ok) {
    if (result.code === "not_found") return jsonError(404, "not_found", "希望が見つかりません。");
    return jsonError(409, "version_conflict", "別の画面で条件が更新されています。最新の条件を確認してから保存してください。", {
      current: result.current,
    });
  }
  await recordUsageEvent({ eventType: "wish_updated", userId: ctx.user.id, anonIdHash: null });
  return jsonOk({ wish: result.wish });
}

export async function DELETE(request: Request, context: Ctx) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");
  const id = await wishId(context);
  if (!id) return jsonError(404, "not_found", "希望が見つかりません。");
  const ctx = await requireWishContext();
  if (ctx instanceof Response) return ctx;
  // 版・報告は外部キーの ON DELETE CASCADE で一括削除される。
  const deleted = await ctx.store.remove(id);
  if (!deleted) return jsonError(404, "not_found", "希望が見つかりません。");
  return jsonOk({ deleted: true });
}
