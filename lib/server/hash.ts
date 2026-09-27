import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSigningSecret } from "./env";
import { jstDayForHash } from "./time";

/** Redisキー等に使う識別子のハッシュ。元の値を保存しない。 */
export function hashForKey(value: string): string {
  return createHmac("sha256", getSigningSecret("hash")).update(value).digest("base64url").slice(0, 22);
}

/**
 * IPアドレスの短期ハッシュ。日付を混ぜて日ごとに変わるようにし、長期の追跡に使えないようにする。
 */
export function hashIp(ip: string | null, now = new Date()): string | null {
  if (!ip) return null;
  return createHmac("sha256", getSigningSecret("hash"))
    .update(`${jstDayForHash(now)}|${ip}`)
    .digest("base64url")
    .slice(0, 22);
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function sign(payload: string): string {
  return createHmac("sha256", getSigningSecret("session")).update(payload).digest("base64url");
}

export function verifySignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
