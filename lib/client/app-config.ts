import type { CategoryConfig } from "@/lib/categories";
import type { SourceStatus } from "@/lib/schemas/source";

/** サーバーからクライアントへ渡す公開設定（secretを含めない）。 */
export type AppConfig = {
  appName: string;
  mode: "demo" | "live";
  /** 条件抽出の方式。none の場合は条件フォームからの検索のみ。 */
  aiMode: "llm" | "demo_parser" | "none";
  /** live で Supabase Auth が設定済みか。 */
  authEnabled: boolean;
  category: CategoryConfig;
  sources: SourceStatus[];
  limits: { wishRetentionMonths: number; opsRetentionDays: number };
};
