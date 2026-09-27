import type { Feedback, FeedbackInput } from "@/lib/schemas/feedback";
import { conditionsEqual, type PurchaseWish, type WishConditions, type WishStatus } from "@/lib/schemas/wish";
import type { WishStore } from "@/lib/wishes/store";

/**
 * APIテスト用のメモリDB。RLSと同じく、ストアは本人の行だけを見える・変更できるようにする。
 */
export class FakeDb {
  wishes = new Map<string, PurchaseWish>();
  revisions = new Map<string, Set<number>>();
  feedback: Feedback[] = [];

  storeFor(userId: string): WishStore {
    const own = (id: string) => {
      const w = this.wishes.get(id);
      return w && w.userId === userId ? w : null;
    };
    return {
      list: async () => {
        return [...this.wishes.values()].filter((w) => w.userId === userId);
      },
      get: async (id) => {
        return own(id);
      },
      create: async (c: WishConditions) => {
        if ([...this.wishes.values()].filter((w) => w.userId === userId).length >= 20) return { ok: false, code: "limit" };
        const now = new Date().toISOString();
        const wish: PurchaseWish = {
          ...c,
          id: crypto.randomUUID(),
          userId,
          version: 1,
          status: "active",
          lastSearchedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        this.wishes.set(wish.id, wish);
        this.revisions.set(wish.id, new Set([1]));
        return { ok: true, wish };
      },
      updateConditions: async (id, expectedVersion, c) => {
        const cur = own(id);
        if (!cur) return { ok: false, code: "not_found" };
        if (cur.version !== expectedVersion) return { ok: false, code: "conflict", current: cur };
        const next = conditionsEqual(cur, c) ? cur : { ...cur, ...c, version: cur.version + 1 };
        this.wishes.set(id, next);
        this.revisions.get(id)!.add(next.version);
        return { ok: true, wish: next };
      },
      updateStatus: async (id, status: WishStatus) => {
        const cur = own(id);
        if (!cur) return null;
        const next = { ...cur, status };
        this.wishes.set(id, next);
        return next;
      },
      touchSearched: async () => {},
      remove: async (id) => {
        if (!own(id)) return false;
        this.wishes.delete(id);
        this.feedback = this.feedback.filter((f) => f.wishId !== id);
        return true;
      },
      listFeedback: async (wishId) => {
        return own(wishId) ? this.feedback.filter((f) => f.wishId === wishId) : [];
      },
      addFeedback: async (wishId, input: FeedbackInput) => {
        if (!own(wishId)) return { ok: false, code: "not_found" };
        if (!this.revisions.get(wishId)?.has(input.wishVersion)) return { ok: false, code: "version_not_found" };
        const fb: Feedback = { ...input, id: crypto.randomUUID(), wishId, createdAt: new Date().toISOString() };
        this.feedback.push(fb);
        return { ok: true, feedback: fb };
      },
    };
  }
}
