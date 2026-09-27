import { z } from "zod";
import { getAuthContext } from "@/lib/auth/server";
import { readAnonId } from "@/lib/server/anon";
import { getEnv, isDemoMode } from "@/lib/server/env";
import { hashForKey, hashIp } from "@/lib/server/hash";
import { clientIp, isSameOrigin, jsonError, readJson } from "@/lib/server/http";
import { getLimitStore } from "@/lib/server/limit-store";
import { recordUsageEvent } from "@/lib/server/ops-log";

const utm = z.string().regex(/^[a-z0-9_-]{1,40}$/).nullable().optional();

/** クライアントから受け付けるイベントは限定する。本文・価格・URLは受け付けない。 */
const EventSchema = z
  .object({
    type: z.enum(["outbound_click", "search_started", "login_completed", "landing_view", "demo_cta_click", "demo_started"]),
    clientEventId: z.string().uuid(),
    sourceId: z.enum(["rakuten", "amazon"]).nullable().optional(),
    placement: z.enum(["header", "hero", "preview", "footer"]).nullable().optional(),
    utmSource: utm,
    utmMedium: utm,
    utmCampaign: utm,
  })
  .strict();

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");
  let raw: unknown;
  try {
    raw = await readJson(request, 2_000);
  } catch {
    return jsonError(400, "invalid_json", "入力が不正です。");
  }
  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) return jsonError(400, "invalid_event", "入力が不正です。");
  const e = parsed.data;

  const auth = isDemoMode() ? null : await getAuthContext();
  const anonId = readAnonId(request.headers.get("cookie"));
  // 紹介サイトの訪問者は匿名IDを持たないため、重複・頻度の制限だけ短期のIPハッシュで行い、保存はしない。
  const marketing = e.type === "landing_view" || e.type === "demo_cta_click" || e.type === "demo_started";
  const subject = auth?.user.id ?? anonId ?? (marketing ? hashIp(clientIp(request)) : null);
  if (!subject) return new Response(null, { status: 204 });

  // 頻度・重複の制限（失敗してもクリック先への遷移は妨げない）
  try {
    const store = getLimitStore();
    const key = hashForKey(subject);
    const fresh = await store.claimOnce(`evt:${key}:${hashForKey(e.clientEventId)}`, 10 * 60 * 1000);
    if (!fresh) return new Response(null, { status: 204 });
    const minute = Math.floor(Date.now() / 60000);
    const r = await store.reserve(`evt:min:${minute}:${key}`, getEnv().EVENTS_PER_MINUTE, 120_000);
    if (!r.ok) return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }

  await recordUsageEvent({
    eventType: e.type,
    userId: auth?.user.id ?? null,
    anonIdHash: auth ? null : anonId ? hashForKey(anonId) : null,
    sourceId: e.sourceId ?? null,
    placement: e.type === "demo_cta_click" ? (e.placement ?? null) : null,
    utm: { source: e.utmSource, medium: e.utmMedium, campaign: e.utmCampaign },
  });
  return new Response(null, { status: 204 });
}
