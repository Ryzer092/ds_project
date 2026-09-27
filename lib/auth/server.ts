import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getEnv, isDemoMode, supabaseConfigured } from "@/lib/server/env";

export type AuthUser = { id: string; email: string | null; lastSignInAt: string | null };
export type AuthContext = { supabase: SupabaseClient; user: AuthUser };

/**
 * 本人の認証コンテキストで動くSupabaseクライアント（RLSが適用される）。
 * 利用者の操作は必ずこれで行い、service role でRLSを迂回しない。
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = getEnv();
  if (isDemoMode(env) || !supabaseConfigured(env)) return null;
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component から呼ばれた場合は書き込めない。セッション更新は proxy.ts が担う。
        }
      },
    },
  });
}

/**
 * 認証済みの本人を返す。getUser() は認証サーバーでトークンを検証する。
 * クライアントから送られた userId は使わない。
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    supabase,
    user: { id: data.user.id, email: data.user.email ?? null, lastSignInAt: data.user.last_sign_in_at ?? null },
  };
}
