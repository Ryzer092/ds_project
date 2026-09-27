import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, isDemoMode } from "@/lib/server/env";

let admin: SupabaseClient | null | undefined;

/**
 * サーバー専用の管理クライアント（RLSを迂回する）。用途を以下に限定する:
 * - 運用メタデータ（search_runs / usage_events）の書き込み
 * - 本人確認済みのアカウント削除（auth.admin.deleteUser）
 * 利用者データの読み書きには使わない。
 */
export function getAdminClient(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const env = getEnv();
  if (isDemoMode(env) || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVER_SECRET_KEY) {
    admin = null;
    return admin;
  }
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVER_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
