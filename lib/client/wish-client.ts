import type { Feedback, FeedbackInput } from "@/lib/schemas/feedback";
import { LIMITS } from "@/lib/schemas/limits";
import { conditionsEqual, type PurchaseWish, type WishConditions, type WishStatus } from "@/lib/schemas/wish";
import { buildWishTitle } from "@/lib/wishes/title";

export class WishClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly current?: PurchaseWish,
  ) {
    super(message);
    this.name = "WishClientError";
  }
}

/** 画面から使う保存先。live はAPI、demo はこのタブのメモリ。 */
export interface WishClient {
  readonly kind: "api" | "memory";
  list(): Promise<PurchaseWish[]>;
  get(id: string): Promise<{ wish: PurchaseWish; feedback: Feedback[] }>;
  create(conditions: WishConditions): Promise<PurchaseWish>;
  updateConditions(id: string, expectedVersion: number, conditions: WishConditions): Promise<PurchaseWish>;
  updateStatus(id: string, status: WishStatus): Promise<PurchaseWish>;
  remove(id: string): Promise<void>;
  addFeedback(id: string, input: FeedbackInput): Promise<Feedback>;
  searchContext(id: string): Promise<{ contextToken: string | null; wish: PurchaseWish }>;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; current?: PurchaseWish } } | null;
    throw new WishClientError(
      res.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? "処理に失敗しました。",
      body?.error?.current,
    );
  }
  return (await res.json()) as T;
}

export class ApiWishClient implements WishClient {
  readonly kind = "api" as const;
  async list() {
    return (await call<{ wishes: PurchaseWish[] }>("/api/wishes")).wishes;
  }
  async get(id: string) {
    return call<{ wish: PurchaseWish; feedback: Feedback[] }>(`/api/wishes/${encodeURIComponent(id)}`);
  }
  async create(conditions: WishConditions) {
    return (await call<{ wish: PurchaseWish }>("/api/wishes", { method: "POST", body: JSON.stringify({ conditions }) })).wish;
  }
  async updateConditions(id: string, expectedVersion: number, conditions: WishConditions) {
    return (
      await call<{ wish: PurchaseWish }>(`/api/wishes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion, conditions }),
      })
    ).wish;
  }
  async updateStatus(id: string, status: WishStatus) {
    return (
      await call<{ wish: PurchaseWish }>(`/api/wishes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
    ).wish;
  }
  async remove(id: string) {
    await call(`/api/wishes/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  async addFeedback(id: string, input: FeedbackInput) {
    return (
      await call<{ feedback: Feedback }>(`/api/wishes/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).feedback;
  }
  async searchContext(id: string) {
    return call<{ contextToken: string; wish: PurchaseWish }>(`/api/wishes/${encodeURIComponent(id)}/search-context`, {
      method: "POST",
    });
  }
}

/**
 * デモ用。ブラウザのメモリ上だけで動き、再読み込みで消える（永続ストレージを使わない）。
 * サーバー版と同じ版管理・件数上限・競合検出を再現する。
 */
export class MemoryWishClient implements WishClient {
  readonly kind = "memory" as const;
  private wishes = new Map<string, PurchaseWish>();
  private revisions = new Map<string, Set<number>>();
  private feedback = new Map<string, Feedback[]>();

  async list() {
    return [...this.wishes.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((w) => structuredClone(w));
  }
  private mustGet(id: string) {
    const w = this.wishes.get(id);
    if (!w) throw new WishClientError(404, "not_found", "希望が見つかりません。");
    return w;
  }
  async get(id: string) {
    return { wish: structuredClone(this.mustGet(id)), feedback: structuredClone(this.feedback.get(id) ?? []) };
  }
  async create(conditions: WishConditions) {
    if (this.wishes.size >= LIMITS.wishesPerUser) {
      throw new WishClientError(409, "wish_limit", `保存できる希望は${LIMITS.wishesPerUser}件までです。`);
    }
    const now = new Date().toISOString();
    const wish: PurchaseWish = {
      ...structuredClone(conditions),
      title: conditions.title || buildWishTitle(conditions),
      id: crypto.randomUUID(),
      userId: "demo-user",
      version: 1,
      status: "active",
      lastSearchedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.wishes.set(wish.id, wish);
    this.revisions.set(wish.id, new Set([1]));
    return structuredClone(wish);
  }
  async updateConditions(id: string, expectedVersion: number, conditions: WishConditions) {
    const cur = this.mustGet(id);
    if (cur.version !== expectedVersion) {
      throw new WishClientError(409, "version_conflict", "別の画面で条件が更新されています。", structuredClone(cur));
    }
    const nextConditions = { ...conditions, title: conditions.title || buildWishTitle(conditions) };
    if (conditionsEqual(cur, nextConditions)) return structuredClone(cur);
    const next: PurchaseWish = { ...cur, ...structuredClone(nextConditions), version: cur.version + 1, updatedAt: new Date().toISOString() };
    this.wishes.set(id, next);
    this.revisions.get(id)?.add(next.version);
    return structuredClone(next);
  }
  async updateStatus(id: string, status: WishStatus) {
    const cur = this.mustGet(id);
    const next = { ...cur, status, updatedAt: new Date().toISOString() };
    this.wishes.set(id, next);
    return structuredClone(next);
  }
  async remove(id: string) {
    this.mustGet(id);
    this.wishes.delete(id);
    this.revisions.delete(id);
    this.feedback.delete(id);
  }
  async addFeedback(id: string, input: FeedbackInput) {
    this.mustGet(id);
    if (!this.revisions.get(id)?.has(input.wishVersion)) {
      throw new WishClientError(409, "version_not_found", "条件の版が見つかりません。");
    }
    const fb: Feedback = { ...input, id: crypto.randomUUID(), wishId: id, createdAt: new Date().toISOString() };
    this.feedback.set(id, [fb, ...(this.feedback.get(id) ?? [])]);
    return structuredClone(fb);
  }
  async searchContext(id: string) {
    const cur = this.mustGet(id);
    this.wishes.set(id, { ...cur, lastSearchedAt: new Date().toISOString() });
    return { contextToken: null, wish: structuredClone(cur) };
  }
}
