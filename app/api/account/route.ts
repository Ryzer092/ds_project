import { z } from "zod";
import { getAdminClient } from "@/lib/auth/admin";
import { getAuthContext } from "@/lib/auth/server";
import { isDemoMode } from "@/lib/server/env";
import { isSameOrigin, jsonError, jsonOk, readJson } from "@/lib/server/http";
import { opsLog } from "@/lib/server/ops-log";

const DeleteSchema = z.object({ confirm: z.literal("削除する") }).strict();

/** 直近のログインから一定時間内の場合だけ削除を受け付ける（本人確認）。 */
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");
  if (isDemoMode()) return jsonError(404, "demo_mode", "デモモードにはアカウントがありません。");
  const auth = await getAuthContext();
  if (!auth) return jsonError(401, "unauthenticated", "ログインが必要です。");

  let raw: unknown;
  try {
    raw = await readJson(request, 2_000);
  } catch {
    return jsonError(400, "invalid_json", "入力を読み取れませんでした。");
  }
  if (!DeleteSchema.safeParse(raw).success) {
    return jsonError(400, "confirmation_required", "確認のため「削除する」と入力してください。");
  }
  const last = auth.user.lastSignInAt ? Date.parse(auth.user.lastSignInAt) : 0;
  if (!last || Date.now() - last > REAUTH_WINDOW_MS) {
    return jsonError(401, "reauth_required", "本人確認のため、もう一度ログインしてから削除してください。");
  }

  // 1) 本人の認証コンテキストで購入希望を削除（版・報告はカスケード削除）
  const { error: wishError } = await auth.supabase.from("purchase_wishes").delete().eq("user_id", auth.user.id);
  if (wishError) return jsonError(500, "delete_failed", "削除に失敗しました。時間をおいて再度お試しください。");

  // 2) 認証ユーザーの削除（運用メタデータは外部キーでカスケード削除）
  const admin = getAdminClient();
  if (!admin) return jsonError(503, "admin_unavailable", "アカウント削除は現在利用できません。お問い合わせください。");
  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) return jsonError(500, "delete_failed", "アカウントの削除に失敗しました。");
  await auth.supabase.auth.signOut().catch(() => undefined);
  opsLog("account_deleted", {});
  return jsonOk({ deleted: true });
}
