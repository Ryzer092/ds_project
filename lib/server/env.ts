import "server-only";
import { z } from "zod";

/**
 * サーバー側の設定。secret はサーバー専用で、クライアントへ渡さない。
 * 設定名はアプリ側の名前であり、公式SDKの引数名ではない。
 */
const intFromEnv = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? def : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? null : v.trim()));

const EnvSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  SEARCH_MODE: z.enum(["demo", "live"]).optional().default("demo"),
  APP_ORIGIN: z.string().url().optional().default("http://localhost:3000"),
  APP_NAME: z.string().optional().default("Next AI Agent"),
  INITIAL_CATEGORY: z.string().optional().default("desks"),

  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high"]).optional().default("low"),

  RAKUTEN_APPLICATION_ID: optionalString,
  RAKUTEN_ACCESS_KEY: optionalString,
  RAKUTEN_AFFILIATE_ID: optionalString,

  AMAZON_CREDENTIAL_ID: optionalString,
  AMAZON_CREDENTIAL_SECRET: optionalString,
  AMAZON_CREDENTIAL_VERSION: optionalString,
  AMAZON_PARTNER_TAG: optionalString,
  AMAZON_MARKETPLACE: z.string().optional().default("www.amazon.co.jp"),

  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SERVER_SECRET_KEY: optionalString,

  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  SESSION_SIGNING_SECRET: optionalString,
  RATE_LIMIT_HASH_SECRET: optionalString,

  MAX_GLOBAL_SEARCHES_PER_DAY: intFromEnv(100, 0),
  MAX_LLM_CALLS_PER_DAY: intFromEnv(200, 0),
  MAX_PROVIDER_CALLS_PER_DAY: intFromEnv(1000, 0),
  PROVIDER_MAX_RPS: intFromEnv(1, 1, 10),
  SEARCH_TIMEOUT_MS: intFromEnv(30000, 1000, 60000),
  PROVIDER_TIMEOUT_MS: intFromEnv(10000, 500, 30000),
  LLM_TIMEOUT_MS: intFromEnv(15000, 1000, 60000),
  ANON_SEARCHES_PER_MINUTE: intFromEnv(5, 1),
  ANON_SEARCHES_PER_DAY: intFromEnv(10, 1),
  IP_SEARCHES_PER_DAY: intFromEnv(40, 1),
  USER_SEARCHES_PER_DAY: intFromEnv(30, 1),
  EVENTS_PER_MINUTE: intFromEnv(30, 1),
  WISH_RETENTION_MONTHS: intFromEnv(12, 1, 120),
  OPS_RETENTION_DAYS: intFromEnv(30, 1, 365),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`環境変数が不正です: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

/** テスト用。 */
export function resetEnvCache() {
  cached = null;
}

export function isProduction(env = getEnv()) {
  return env.NODE_ENV === "production";
}

export function isDemoMode(env = getEnv()) {
  return env.SEARCH_MODE === "demo";
}

export function supabaseConfigured(env = getEnv()) {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function redisConfigured(env = getEnv()) {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

/** 署名用secret。本番で未設定なら起動時ではなく利用時にエラーにする。 */
export function getSigningSecret(kind: "session" | "hash", env = getEnv()): string {
  const v = kind === "session" ? env.SESSION_SIGNING_SECRET : env.RATE_LIMIT_HASH_SECRET;
  if (v && v.length >= 32) return v;
  if (isProduction(env) && !isDemoMode(env)) {
    throw new Error(`${kind === "session" ? "SESSION_SIGNING_SECRET" : "RATE_LIMIT_HASH_SECRET"} を32文字以上で設定してください`);
  }
  return `dev-only-insecure-${kind}-secret-do-not-use-in-production`;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
