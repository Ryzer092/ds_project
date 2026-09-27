import "server-only";
import { getEnv } from "./env";

/** JSONエラー応答。内部の詳細（スタック・SQL等）は返さない。 */
export function jsonError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * 状態を変更するリクエストの Origin 検証（CSRF対策）。
 * Origin がない場合は Sec-Fetch-Site で同一オリジンを確認する。
 */
export function isSameOrigin(request: Request): boolean {
  const env = getEnv();
  const allowed = new URL(env.APP_ORIGIN).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === allowed;
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin";
}

export async function readJson(request: Request, maxBytes = 32_000): Promise<unknown> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new BodyTooLargeError();
  const text = await request.text();
  if (text.length > maxBytes) throw new BodyTooLargeError();
  return JSON.parse(text);
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("body too large");
    this.name = "BodyTooLargeError";
  }
}

export function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 64) || null;
  return request.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
