import "server-only";
import { DEFAULT_ANTHROPIC_MODEL, getEnv, isDemoMode } from "@/lib/server/env";
import { ClaudeExtractor } from "./claude";
import { DemoParserExtractor } from "./demo-parser";
import type { ConditionExtractor } from "./types";

let extractor: ConditionExtractor | null | undefined;

/**
 * 条件抽出の実装を選ぶ。
 * - ANTHROPIC_API_KEY があれば Claude（demo/live 共通）。
 * - demo でキーがなければデモ用の簡易解析（画面に明示）。
 * - live でキーがなければ null（条件フォームからの検索のみ。AIが動いたように見せない）。
 */
export function getExtractor(): ConditionExtractor | null {
  if (extractor !== undefined) return extractor;
  const env = getEnv();
  if (env.ANTHROPIC_API_KEY) {
    extractor = new ClaudeExtractor({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
      effort: env.ANTHROPIC_EFFORT,
      timeoutMs: env.LLM_TIMEOUT_MS,
    });
  } else if (isDemoMode(env)) {
    extractor = new DemoParserExtractor();
  } else {
    extractor = null;
  }
  return extractor;
}

export function setExtractorForTesting(e: ConditionExtractor | null | undefined) {
  extractor = e;
}
