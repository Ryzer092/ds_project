import { isSameOrigin, jsonError, jsonOk, UUID_RE } from "@/lib/server/http";
import { createSearchContextToken } from "@/lib/server/search-context";
import { requireWishContext } from "@/lib/wishes/context";

/**
 * 保存した条件をサーバーで読み、本人だけが使える一時的な検索コンテキストを作る。
 * 条件原文・ユーザーIDはURLに載せず、レスポンス本文で返してタブ内メモリに保持させる。
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return jsonError(404, "not_found", "希望が見つかりません。");
  const ctx = await requireWishContext();
  if (ctx instanceof Response) return ctx;
  const wish = await ctx.store.get(id);
  if (!wish) return jsonError(404, "not_found", "希望が見つかりません。");
  const token = createSearchContextToken({ wishId: wish.id, version: wish.version, userId: ctx.user.id });
  return jsonOk({ contextToken: token, wish });
}
