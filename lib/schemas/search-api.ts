import { z } from "zod";
import { LIMITS } from "./limits";
import type { Offer, SourceId } from "./offer";
import type { SourceRunOutcome } from "./source";
import type { WishConditions } from "./wish";

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(LIMITS.historyTurnMaxChars),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

/** POST /api/search の入力。conditions はさらに parseConditions で検証する。 */
export const SearchRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  message: z.string().trim().max(LIMITS.messageMaxChars).nullable(),
  history: z.array(ChatTurnSchema).max(LIMITS.historyMaxTurns * 2),
  conditions: z.unknown(),
  /** 保存済み希望から作った一時的な検索コンテキスト（本人のみ有効）。 */
  contextToken: z.string().max(1000).nullable(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export type AiUsage = "llm" | "demo_parser" | "none";

export type SearchEvent =
  | { type: "status"; requestId: string; stage: "understanding" | "searching" | "matching"; message: string }
  | {
      type: "intent";
      requestId: string;
      conditions: WishConditions;
      aiUsed: AiUsage;
      /** 条件の読み取りに関する注意（採用しなかった指定など）。 */
      notes: string[];
      reply: string | null;
      keywords: string;
    }
  | { type: "clarification"; requestId: string; questions: string[]; outOfScope: boolean; message: string }
  | {
      type: "offers";
      requestId: string;
      sourceId: SourceId;
      label: string;
      demo: boolean;
      /** 確認できた・要確認の候補（通常表示）。 */
      offers: Offer[];
      /** 必須条件と異なる候補（別表示）。 */
      excluded: Offer[];
      notices: string[];
      affiliate: boolean;
    }
  | {
      type: "source_status";
      requestId: string;
      sourceId: SourceId;
      label: string;
      outcome: SourceRunOutcome;
      message: string;
      demo: boolean;
    }
  | { type: "error"; requestId: string; code: string; message: string; retryable: boolean }
  | { type: "done"; requestId: string; searched: boolean };

export type SearchEventType = SearchEvent["type"];

/** requestId を除いたイベント（サーバー内部で組み立てる形）。 */
export type SearchEventPayload = SearchEvent extends infer E
  ? E extends SearchEvent
    ? Omit<E, "requestId">
    : never
  : never;
