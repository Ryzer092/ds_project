import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getWish, PATCH, DELETE } from "@/app/api/wishes/[id]/route";
import { POST as postFeedback } from "@/app/api/wishes/[id]/feedback/route";
import { POST as postContext } from "@/app/api/wishes/[id]/search-context/route";
import { GET as listWishes, POST as createWish } from "@/app/api/wishes/route";
import { verifySearchContextToken } from "@/lib/server/search-context";
import { setWishContextForTesting } from "@/lib/wishes/context";
import { FakeDb } from "../support/fake-wish-store";
import { conditions } from "../support/factories";

vi.mock("@/lib/server/ops-log", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/ops-log")>()),
  recordUsageEvent: vi.fn(async () => undefined),
}));

const ORIGIN = "http://localhost:3000";
let db: FakeDb;
let currentUser: string | null;

function req(method: string, body?: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  return new Request("http://localhost:3000/api/x", { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  db = new FakeDb();
  currentUser = "user-a";
  setWishContextForTesting(async () =>
    currentUser ? { user: { id: currentUser, email: null, lastSignInAt: null }, store: db.storeFor(currentUser) } : null,
  );
});
afterEach(() => setWishContextForTesting(null));

async function createAs(user: string, overrides = {}) {
  currentUser = user;
  const res = await createWish(req("POST", { conditions: conditions({ productType: "デスク", budgetJpy: 20000, ...overrides }) }));
  expect(res.status).toBe(201);
  return (await res.json()).wish as { id: string; version: number; userId: string; title: string };
}

describe("/api/wishes", () => {
  it("未認証は401", async () => {
    currentUser = null;
    expect((await listWishes()).status).toBe(401);
    expect((await createWish(req("POST", { conditions: conditions() }))).status).toBe(401);
  });

  it("別オリジンからの変更は403", async () => {
    expect((await createWish(req("POST", { conditions: conditions() }, "https://evil.example"))).status).toBe(403);
    expect((await createWish(req("POST", { conditions: conditions() }, null))).status).toBe(403);
  });

  it("保存時に本人の条件からタイトルを作り、クライアントの userId は受け付けない", async () => {
    const w = await createAs("user-a");
    expect(w.userId).toBe("user-a");
    expect(w.title).toContain("デスク");
    const forged = await createWish(req("POST", { conditions: conditions(), userId: "user-b" }));
    expect(forged.status).toBe(400);
  });

  it("不正な条件は400", async () => {
    const res = await createWish(req("POST", { conditions: { ...conditions(), budgetJpy: -1 } }));
    expect(res.status).toBe(400);
  });

  it("一覧は本人の希望だけ", async () => {
    await createAs("user-a");
    await createAs("user-b");
    currentUser = "user-a";
    const body = await (await listWishes()).json();
    expect(body.wishes).toHaveLength(1);
    expect(body.wishes[0].userId).toBe("user-a");
  });

  it("20件を超えて保存できない", async () => {
    for (let i = 0; i < 20; i++) await createAs("user-a");
    const res = await createWish(req("POST", { conditions: conditions() }));
    expect(res.status).toBe(409);
  });
});

describe("/api/wishes/[id]", () => {
  it("他人の希望は取得・更新・削除・報告・検索コンテキスト作成のすべてで404", async () => {
    const w = await createAs("user-a");
    currentUser = "user-b";
    expect((await getWish(req("GET", undefined), params(w.id))).status).toBe(404);
    expect((await PATCH(req("PATCH", { expectedVersion: 1, conditions: conditions() }), params(w.id))).status).toBe(404);
    expect((await PATCH(req("PATCH", { status: "paused" }), params(w.id))).status).toBe(404);
    expect((await DELETE(req("DELETE"), params(w.id))).status).toBe(404);
    const fb = { wishVersion: 1, outcome: "purchased", purchasedFrom: "amazon", skipReasons: [], comment: null, sourceId: null };
    expect((await postFeedback(req("POST", fb), params(w.id))).status).toBe(404);
    expect((await postContext(req("POST"), params(w.id))).status).toBe(404);
    // 本人の記録は変わっていない
    expect(db.wishes.get(w.id)?.version).toBe(1);
    expect(db.feedback).toHaveLength(0);
  });

  it("古い version での更新は409で最新を返し、正しい version なら版が進む", async () => {
    const w = await createAs("user-a");
    const ok = await PATCH(req("PATCH", { expectedVersion: 1, conditions: conditions({ productType: "デスク", budgetJpy: 25000 }) }), params(w.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).wish.version).toBe(2);
    const stale = await PATCH(req("PATCH", { expectedVersion: 1, conditions: conditions({ budgetJpy: 30000 }) }), params(w.id));
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error.code).toBe("version_conflict");
    expect(body.error.current.version).toBe(2);
  });

  it("状態の変更と、条件・状態以外の項目の拒否", async () => {
    const w = await createAs("user-a");
    expect((await PATCH(req("PATCH", { status: "paused" }), params(w.id))).status).toBe(200);
    expect((await PATCH(req("PATCH", { status: "paused", userId: "user-b" }), params(w.id))).status).toBe(400);
    expect((await PATCH(req("PATCH", { status: "deleted" }), params(w.id))).status).toBe(400);
  });

  it("不正なIDは404", async () => {
    expect((await getWish(req("GET"), params("../etc"))).status).toBe(404);
  });

  it("削除で報告も消える", async () => {
    const w = await createAs("user-a");
    const fb = { wishVersion: 1, outcome: "skipped", purchasedFrom: null, skipReasons: ["price"], comment: "高い", sourceId: "rakuten" };
    expect((await postFeedback(req("POST", fb), params(w.id))).status).toBe(201);
    expect((await DELETE(req("DELETE"), params(w.id))).status).toBe(200);
    expect(db.feedback).toHaveLength(0);
    expect((await getWish(req("GET"), params(w.id))).status).toBe(404);
  });
});

describe("/api/wishes/[id]/feedback", () => {
  it("存在しない条件の版への報告は409、自己申告として記録する", async () => {
    const w = await createAs("user-a");
    const base = { outcome: "purchased", purchasedFrom: "rakuten", skipReasons: [], comment: null, sourceId: null };
    expect((await postFeedback(req("POST", { ...base, wishVersion: 5 }), params(w.id))).status).toBe(409);
    const ok = await postFeedback(req("POST", { ...base, wishVersion: 1 }), params(w.id));
    expect(ok.status).toBe(201);
    expect((await ok.json()).feedback).toMatchObject({ outcome: "purchased", purchasedFrom: "rakuten", wishVersion: 1 });
  });

  it("注文番号など許可しない項目・長すぎるコメントは400", async () => {
    const w = await createAs("user-a");
    const base = { wishVersion: 1, outcome: "purchased", purchasedFrom: "amazon", skipReasons: [], comment: null, sourceId: null };
    expect((await postFeedback(req("POST", { ...base, orderId: "123-456" }), params(w.id))).status).toBe(400);
    expect((await postFeedback(req("POST", { ...base, comment: "あ".repeat(301) }), params(w.id))).status).toBe(400);
  });
});

describe("/api/wishes/[id]/search-context", () => {
  it("本人用の一時トークンを返し、URLに載せる情報を含めない", async () => {
    const w = await createAs("user-a");
    const res = await postContext(req("POST"), params(w.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(verifySearchContextToken(body.contextToken, "user-a")).toMatchObject({ wishId: w.id, version: 1 });
    expect(verifySearchContextToken(body.contextToken, "user-b")).toBeNull();
  });
});
