import { z } from "zod";
import { LIMITS } from "@/lib/schemas/limits";
import { parseConditions } from "@/lib/schemas/wish";
import { BodyTooLargeError, isSameOrigin, jsonError, jsonOk, readJson } from "@/lib/server/http";
import { recordUsageEvent } from "@/lib/server/ops-log";
import { requireWishContext } from "@/lib/wishes/context";
import { buildWishTitle } from "@/lib/wishes/title";

const CreateSchema = z.object({ conditions: z.unknown() }).strict();

export async function GET() {
  const ctx = await requireWishContext();
  if (ctx instanceof Response) return ctx;
  const wishes = await ctx.store.list();
  return jsonOk({ wishes });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");
  const ctx = await requireWishContext();
  if (ctx instanceof Response) return ctx;

  let raw: unknown;
  try {
    raw = await readJson(request);
  } catch (e) {
    return jsonError(e instanceof BodyTooLargeError ? 413 : 400, "invalid_json", "入力を読み取れませんでした。");
  }
  // userId など余計な項目は受け付けない（所有者はサーバーの認証から決まる）。
  const body = CreateSchema.safeParse(raw);
  if (!body.success) return jsonError(400, "invalid_request", "入力が不正です。");
  const parsed = parseConditions(body.data.conditions);
  if (!parsed.ok) return jsonError(400, "invalid_conditions", "条件の指定が不正です。", { issues: parsed.issues });

  const conditions = { ...parsed.value, title: parsed.value.title || buildWishTitle(parsed.value) };
  const existing = await ctx.store.list();
  if (existing.length >= LIMITS.wishesPerUser) {
    return jsonError(409, "wish_limit", `保存できる希望は${LIMITS.wishesPerUser}件までです。不要な希望を削除してください。`);
  }
  const result = await ctx.store.create(conditions);
  if (!result.ok) {
    return result.code === "limit"
      ? jsonError(409, "wish_limit", `保存できる希望は${LIMITS.wishesPerUser}件までです。`)
      : jsonError(400, "invalid_conditions", "条件の指定が不正です。");
  }
  await recordUsageEvent({ eventType: "wish_saved", userId: ctx.user.id, anonIdHash: null });
  return jsonOk({ wish: result.wish }, 201);
}
