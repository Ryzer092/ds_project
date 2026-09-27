import "server-only";
import { randomId, sign, verifySignature } from "./hash";

/**
 * 短期匿名ID（未ログインの利用上限のためだけに使う）。
 * 署名付き Cookie で、24時間で失効する。個人を特定する情報は含めない。
 */
export const ANON_COOKIE = "nxa_anon";
export const ANON_MAX_AGE_SEC = 24 * 60 * 60;

export function readAnonId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${ANON_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(ANON_COOKIE.length + 1));
  const [id, issued, sig] = value.split(".");
  if (!id || !issued || !sig) return null;
  if (!verifySignature(`${id}.${issued}`, sig)) return null;
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt * 1000 > ANON_MAX_AGE_SEC * 1000) return null;
  return id;
}

export function issueAnonCookie(): { id: string; setCookie: string } {
  const id = randomId(12);
  const issued = Math.floor(Date.now() / 1000);
  const value = `${id}.${issued}.${sign(`${id}.${issued}`)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    id,
    setCookie: `${ANON_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${ANON_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure}`,
  };
}
