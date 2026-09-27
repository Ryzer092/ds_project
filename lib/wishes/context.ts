import "server-only";
import { getAuthContext, type AuthUser } from "@/lib/auth/server";
import { isDemoMode } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { SupabaseWishStore, type WishStore } from "./store";

export type WishRequestContext = { user: AuthUser; store: WishStore };

let override: (() => Promise<WishRequestContext | null>) | null = null;

/** テスト用に本人コンテキストを差し替える。 */
export function setWishContextForTesting(fn: (() => Promise<WishRequestContext | null>) | null) {
  override = fn;
}

/**
 * 保存系APIの前提チェック。デモではサーバー保存を行わない（ブラウザのメモリのみ）。
 * 未認証なら401。返すストアは本人の認証コンテキストで動く。
 */
export async function requireWishContext(): Promise<WishRequestContext | Response> {
  if (override) {
    const ctx = await override();
    return ctx ?? jsonError(401, "unauthenticated", "ログインが必要です。");
  }
  if (isDemoMode()) {
    return jsonError(404, "demo_mode", "デモモードではサーバーに保存しません。保存はこのタブのメモリだけで行われます。");
  }
  const auth = await getAuthContext();
  if (!auth) return jsonError(401, "unauthenticated", "ログインが必要です。");
  return { user: auth.user, store: new SupabaseWishStore(auth.supabase) };
}
