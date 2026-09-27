import "server-only";
import { getInitialCategory } from "@/lib/categories";
import type { AppConfig } from "@/lib/client/app-config";
import { getSourceStatuses } from "@/lib/search/providers/registry";
import { getEnv, isDemoMode, supabaseConfigured } from "./env";

export function getAppConfig(): AppConfig {
  const env = getEnv();
  const demo = isDemoMode(env);
  return {
    appName: env.APP_NAME,
    mode: demo ? "demo" : "live",
    aiMode: env.ANTHROPIC_API_KEY ? "llm" : demo ? "demo_parser" : "none",
    authEnabled: !demo && supabaseConfigured(env),
    category: getInitialCategory(env.INITIAL_CATEGORY),
    sources: getSourceStatuses(),
    limits: { wishRetentionMonths: env.WISH_RETENTION_MONTHS, opsRetentionDays: env.OPS_RETENTION_DAYS },
  };
}
