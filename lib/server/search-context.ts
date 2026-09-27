import "server-only";
import { sign, verifySignature } from "./hash";

/**
 * 保存済み希望から再検索するための一時的な検索コンテキスト。
 * 条件原文やユーザーIDをURLに含めず、本人だけが30分間利用できる署名付きトークンにする。
 * トークンはタブ内メモリで保持し、/api/search に渡す。
 */
const TTL_SEC = 30 * 60;

export type SearchContextPayload = { wishId: string; version: number; userId: string; exp: number };

export function createSearchContextToken(p: Omit<SearchContextPayload, "exp">, now = Date.now()): string {
  const payload: SearchContextPayload = { ...p, exp: Math.floor(now / 1000) + TTL_SEC };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(`ctx.${body}`)}`;
}

export function verifySearchContextToken(token: string, userId: string, now = Date.now()): SearchContextPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifySignature(`ctx.${body}`, sig)) return null;
  let payload: SearchContextPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < now) return null;
  if (payload.userId !== userId) return null;
  if (typeof payload.wishId !== "string" || !Number.isInteger(payload.version)) return null;
  return payload;
}
