import type { CategoryConfig } from "@/lib/categories";
import type { ConditionExtractor } from "@/lib/llm/types";
import { getSourcePolicy } from "@/lib/policies/source-policies";
import type { Offer, SourceId } from "@/lib/schemas/offer";
import type { AiUsage, ChatTurn, SearchEventPayload } from "@/lib/schemas/search-api";
import { outcomeMessage, type SourceRunOutcome } from "@/lib/schemas/source";
import type { WishConditions } from "@/lib/schemas/wish";
import { evaluateOffer } from "./matching";
import { buildPlan } from "./plan";
import type { ProviderCallReservation, SearchProvider } from "./providers/types";
import { groupOffers } from "./results";


export type OrchestratorInput = {
  requestId: string;
  message: string | null;
  history: ChatTurn[];
  conditions: WishConditions;
  category: CategoryConfig;
  providers: SearchProvider[];
  extractor: ConditionExtractor | null;
  today: string;
  reserveLlmCall: () => Promise<boolean>;
  reserveProviderCall: (sourceId: SourceId) => Promise<ProviderCallReservation>;
  emit: (event: SearchEventPayload) => void;
  signal: AbortSignal;
  now?: () => Date;
};

export type RunSummary = {
  searched: boolean;
  aiUsed: AiUsage;
  llm: { calls: number; inputTokens: number; outputTokens: number };
  sources: Array<{ sourceId: SourceId; outcome: SourceRunOutcome; shown: number; excluded: number; opsCode: string | null }>;
  conditions: WishConditions;
};

/**
 * 検索の統括。
 * 1) 最新入力から条件の更新案を作る（LLM／デモ用解析）。失敗時は現在の条件のまま続け、成功したように見せない。
 * 2) 曖昧な重要条件だけ質問する。範囲外の希望は案内して検索しない。
 * 3) 利用可能な情報源へ並列に検索し、情報源ごとに結果を返す。片方の失敗で他方の結果を消さない。
 */
export async function runSearch(input: OrchestratorInput): Promise<RunSummary> {
  const { emit, category, signal } = input;
  const now = input.now ?? (() => new Date());
  let conditions = input.conditions;
  let aiUsed: AiUsage = "none";
  let keywords: string[] | null = null;
  const llm = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const summary = (searched: boolean, sources: RunSummary["sources"] = []): RunSummary => ({
    searched,
    aiUsed,
    llm,
    sources,
    conditions,
  });

  if (input.message) {
    if (!input.extractor) {
      emit({
        type: "error",
        code: "ai_unavailable",
        message: "AIによる条件の読み取りは現在利用できません。条件フォームで指定して検索してください。",
        retryable: false,
      });
      return summary(false);
    }
    emit({ type: "status", stage: "understanding", message: "希望の条件を読み取っています" });
    const result = await input.extractor.extract(
      { message: input.message, history: input.history, current: conditions, category, today: input.today },
      input.reserveLlmCall,
      signal,
    );
    llm.calls += result.usage.calls;
    llm.inputTokens += result.usage.inputTokens;
    llm.outputTokens += result.usage.outputTokens;

    if (!result.ok) {
      emit({
        type: "error",
        code: result.reason === "budget" ? "ai_budget" : "ai_failed",
        message:
          result.reason === "budget"
            ? "本日のAI処理の上限に達しました。条件フォームで指定して検索できます。"
            : "条件を読み取れませんでした。条件フォームで指定して検索してください。",
        retryable: result.reason !== "budget",
      });
      return summary(false);
    }

    aiUsed = input.extractor.kind === "llm" ? "llm" : "demo_parser";
    if (!result.inScope) {
      emit({
        type: "clarification",
        questions: [],
        outOfScope: true,
        message: `${category.scopeDescription}デスク以外の商品は、現在は探せません。`,
      });
      return summary(false);
    }

    conditions = result.conditions;
    keywords = result.keywords;
    const plan = buildPlan(conditions, category, keywords);
    emit({
      type: "intent",
      conditions,
      aiUsed,
      notes: result.notes,
      reply: result.reply,
      keywords: plan.keywords,
    });

    if (result.needsClarificationBeforeSearch && result.clarifications.length > 0) {
      emit({
        type: "clarification",
        questions: result.clarifications.slice(0, 2),
        outOfScope: false,
        message: "検索の前に確認させてください。",
      });
      return summary(false);
    }
    if (result.clarifications.length > 0) {
      emit({
        type: "clarification",
        questions: result.clarifications.slice(0, 2),
        outOfScope: false,
        message: "わかる範囲で候補を探しました。次の点を教えていただくと絞り込めます。",
      });
    }
  } else {
    const plan = buildPlan(conditions, category, null);
    emit({ type: "intent", conditions, aiUsed: "none", notes: [], reply: null, keywords: plan.keywords });
  }

  const plan = buildPlan(conditions, category, keywords);
  emit({ type: "status", stage: "searching", message: "検索元から候補を取得しています" });

  const sources: RunSummary["sources"] = [];
  await Promise.all(
    input.providers.map(async (provider) => {
      const state = provider.status();
      if (state !== "ready") {
        sources.push({ sourceId: provider.sourceId, outcome: "unavailable", shown: 0, excluded: 0, opsCode: state });
        emit({
          type: "source_status",
          sourceId: provider.sourceId,
          label: provider.label,
          outcome: "unavailable",
          message: outcomeMessage("unavailable"),
          demo: provider.demo,
        });
        return;
      }
      let result;
      try {
        result = await provider.search(plan, {
          signal,
          reserveCall: () => input.reserveProviderCall(provider.sourceId),
          now,
        });
      } catch {
        result = { outcome: "error" as const, offers: [], opsCode: "adapter_exception" };
      }

      let shown: Offer[] = [];
      let excluded: Offer[] = [];
      if (result.outcome === "ok") {
        const evaluated = result.offers.map((o) => evaluateOffer(o, conditions, category));
        ({ shown, excluded } = groupOffers(evaluated));
        const policy = provider.demo ? null : getSourcePolicy(provider.sourceId);
        emit({
          type: "offers",
          sourceId: provider.sourceId,
          label: provider.label,
          demo: provider.demo,
          offers: shown,
          excluded,
          notices: policy?.notices ?? [],
          affiliate: provider.affiliate,
        });
      }
      sources.push({
        sourceId: provider.sourceId,
        outcome: result.outcome,
        shown: shown.length,
        excluded: excluded.length,
        opsCode: result.opsCode,
      });
      emit({
        type: "source_status",
        sourceId: provider.sourceId,
        label: provider.label,
        outcome: result.outcome,
        message: outcomeMessage(result.outcome),
        demo: provider.demo,
      });
    }),
  );

  if (sources.length > 0 && sources.every((s) => !["ok", "empty"].includes(s.outcome))) {
    emit({
      type: "error",
      code: "all_sources_failed",
      message: "現在、どの検索元からも候補を取得できません。0件ではなく取得に失敗しています。時間をおいて再度お試しください。",
      retryable: true,
    });
  }
  return summary(true, sources);
}
