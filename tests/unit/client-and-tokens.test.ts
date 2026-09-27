import { describe, expect, it } from "vitest";
import { MemoryWishClient, WishClientError } from "@/lib/client/wish-client";
import { readAnonId, issueAnonCookie } from "@/lib/server/anon";
import { createSearchContextToken, verifySearchContextToken } from "@/lib/server/search-context";
import { encodeSseEvent, parseSseChunk, readSseStream } from "@/lib/sse";
import { conditions } from "../support/factories";

describe("MemoryWishClient（デモ保存）", () => {
  it("保存・版管理・競合検出・報告・削除", async () => {
    const c = new MemoryWishClient();
    const w = await c.create(conditions({ productType: "デスク", budgetJpy: 20000 }));
    expect(w.title).toContain("デスク");
    expect(w.version).toBe(1);

    const w2 = await c.updateConditions(w.id, 1, { ...conditions({ productType: "デスク", budgetJpy: 25000 }), title: w.title });
    expect(w2.version).toBe(2);
    await expect(c.updateConditions(w.id, 1, conditions())).rejects.toMatchObject({ code: "version_conflict" });

    await c.addFeedback(w.id, { wishVersion: 2, outcome: "skipped", purchasedFrom: null, skipReasons: ["price"], comment: null, sourceId: null });
    await expect(
      c.addFeedback(w.id, { wishVersion: 9, outcome: "considering", purchasedFrom: null, skipReasons: [], comment: null, sourceId: null }),
    ).rejects.toBeInstanceOf(WishClientError);
    expect((await c.get(w.id)).feedback).toHaveLength(1);

    await c.remove(w.id);
    await expect(c.get(w.id)).rejects.toMatchObject({ status: 404 });
  });

  it("20件の上限", async () => {
    const c = new MemoryWishClient();
    for (let i = 0; i < 20; i++) await c.create(conditions());
    await expect(c.create(conditions())).rejects.toMatchObject({ code: "wish_limit" });
  });
});

describe("検索コンテキスト", () => {
  it("本人だけが期限内に使える", () => {
    const now = Date.now();
    const token = createSearchContextToken({ wishId: "w1", version: 3, userId: "u1" }, now);
    expect(verifySearchContextToken(token, "u1", now)).toMatchObject({ wishId: "w1", version: 3 });
    expect(verifySearchContextToken(token, "u2", now)).toBeNull();
    expect(verifySearchContextToken(token, "u1", now + 31 * 60 * 1000)).toBeNull();
    const [body] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ wishId: "w2", version: 1, userId: "u1", exp: 9e12 })).toString("base64url")}.${token.split(".")[1]}`;
    expect(verifySearchContextToken(forged, "u1", now)).toBeNull();
    expect(body).not.toContain("u1"); // base64url（平文のままではない）
  });
});

describe("匿名ID Cookie", () => {
  it("署名を検証し、改ざんを拒否する", () => {
    const { id, setCookie } = issueAnonCookie();
    const value = setCookie.split(";")[0];
    expect(readAnonId(value)).toBe(id);
    expect(readAnonId(value.replace(/.$/, "x"))).toBeNull();
    expect(setCookie).toContain("HttpOnly");
  });
});

describe("SSE", () => {
  it("エンコードとストリーム解析の往復", async () => {
    const events = [
      { type: "status", requestId: "r", stage: "searching", message: "取得中" },
      { type: "done", requestId: "r", searched: true },
    ] as const;
    const bytes = events.map((e) => encodeSseEvent(e));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        // チャンク境界をまたぐように分割して送る
        const all = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
        let o = 0;
        for (const b of bytes) {
          all.set(b, o);
          o += b.length;
        }
        c.enqueue(all.slice(0, 7));
        c.enqueue(all.slice(7));
        c.close();
      },
    });
    const got = [];
    for await (const e of readSseStream(stream)) got.push(e);
    expect(got).toEqual(events);
  });

  it("不正なチャンクは無視する", () => {
    expect(parseSseChunk("data: {broken")).toBeNull();
    expect(parseSseChunk('data: {"foo":1}')).toBeNull();
  });
});
