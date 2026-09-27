import { FeedbackInputSchema } from "@/lib/schemas/feedback";
import { BodyTooLargeError, isSameOrigin, jsonError, jsonOk, readJson, UUID_RE } from "@/lib/server/http";
import { recordUsageEvent } from "@/lib/server/ops-log";
import { requireWishContext } from "@/lib/wishes/context";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return jsonError(404, "not_found", "希望が見つかりません。");
  const ctx = await requireWishContext();
  if (ctx instanceof Response) return ctx;

  let raw: unknown;
  try {
    raw = await readJson(request, 8_000);
  } catch (e) {
    return jsonError(e instanceof BodyTooLargeError ? 413 : 400, "invalid_json", "入力を読み取れませんでした。");
  }
  const parsed = FeedbackInputSchema.safeParse(raw);
  if (!parsed.success) return jsonError(400, "invalid_feedback", "入力が不正です（自由記述は300文字まで）。");

  const result = await ctx.store.addFeedback(id, parsed.data);
  if (!result.ok) {
    return result.code === "version_not_found"
      ? jsonError(409, "version_not_found", "条件の版が見つかりません。画面を更新してから再度お試しください。")
      : jsonError(404, "not_found", "希望が見つかりません。");
  }
  await recordUsageEvent({ eventType: "feedback_submitted", userId: ctx.user.id, anonIdHash: null });
  return jsonOk({ feedback: result.feedback }, 201);
}
