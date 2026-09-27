// Supabase マイグレーションの RLS・所有者制約を PGlite（WASM Postgres）で検証する。
// Docker / supabase CLI を使わずに、auth スキーマとロールをスタブで再現してから適用する。
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const stubSql = readFileSync(path.join(root, "tests/support/supabase-auth-stub.sql"), "utf8");
const migrationSql = readFileSync(
  path.join(root, "supabase/migrations/20260926000000_initial_schema.sql"),
  "utf8",
);

// PGlite には pgcrypto が同梱されていない。gen_random_uuid() は PG13 以降の組み込みなので、
// マイグレーション本体は変えずにこの1行だけをテスト側で取り除く。
function preprocessMigration(sql: string): string {
  const pattern = /^create extension if not exists pgcrypto;\s*$/m;
  if (!pattern.test(sql)) throw new Error("pgcrypto の行が見つからない（前処理を見直すこと）");
  return sql.replace(pattern, "-- (test) pgcrypto は PGlite で不要のため除外");
}

type Queryable = PGlite | Transaction;

let db: PGlite;

async function asUser<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return fn(tx);
  });
}

async function asAnon<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("set local role anon");
    await tx.query("select set_config('request.jwt.claim.sub', '', true)");
    return fn(tx);
  });
}

async function createUser(): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@example.test`]);
  return id;
}

type WishRow = {
  id: string;
  user_id: string;
  version: number;
  title: string;
  status: string;
  updated_at: Date;
};

async function insertWish(
  q: Queryable,
  overrides: { title?: string; user_id?: string; budget_jpy?: number } = {},
): Promise<WishRow> {
  const cols = ["title", "category_id"];
  const vals: unknown[] = [overrides.title ?? "ワイヤレスイヤホン", "audio"];
  if (overrides.user_id !== undefined) {
    cols.push("user_id");
    vals.push(overrides.user_id);
  }
  if (overrides.budget_jpy !== undefined) {
    cols.push("budget_jpy");
    vals.push(overrides.budget_jpy);
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const res = await q.query<WishRow>(
    `insert into public.purchase_wishes (${cols.join(", ")}) values (${placeholders})
     returning id, user_id, version, title, status, updated_at`,
    vals,
  );
  return res.rows[0];
}

async function countAsSuperuser(table: string, where: string, params: unknown[]): Promise<number> {
  const res = await db.query<{ n: number }>(
    `select count(*)::int as n from ${table} where ${where}`,
    params,
  );
  return res.rows[0].n;
}

const PERMISSION_DENIED = /permission denied/;
const RLS_VIOLATION = /row-level security/;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(stubSql);
  await db.exec(preprocessMigration(migrationSql));
});

afterAll(async () => {
  await db?.close();
});

describe("purchase_wishes: 本人のみ", () => {
  it("本人は作成・参照・更新・削除できる", async () => {
    const a = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    expect(wish.user_id).toBe(a);
    expect(wish.version).toBe(1);

    const selected = await asUser(a, (tx) =>
      tx.query<WishRow>("select id from public.purchase_wishes where id = $1", [wish.id]),
    );
    expect(selected.rows).toHaveLength(1);

    const updated = await asUser(a, (tx) =>
      tx.query("update public.purchase_wishes set status = 'paused' where id = $1", [wish.id]),
    );
    expect(updated.affectedRows).toBe(1);

    const deleted = await asUser(a, (tx) =>
      tx.query("delete from public.purchase_wishes where id = $1", [wish.id]),
    );
    expect(deleted.affectedRows).toBe(1);
    expect(await countAsSuperuser("public.purchase_wishes", "id = $1", [wish.id])).toBe(0);
  });

  it("別人の user_id を指定しても所有者は auth.uid() に固定される", async () => {
    const a = await createUser();
    const b = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx, { user_id: b }));
    expect(wish.user_id).toBe(a);
    expect(await countAsSuperuser("public.purchase_wishes", "user_id = $1", [b])).toBe(0);
  });

  it("他人の希望は参照・更新・削除できない", async () => {
    const a = await createUser();
    const b = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));

    const selected = await asUser(b, (tx) =>
      tx.query("select id from public.purchase_wishes where id = $1", [wish.id]),
    );
    expect(selected.rows).toHaveLength(0);

    const updated = await asUser(b, (tx) =>
      tx.query("update public.purchase_wishes set title = '乗っ取り' where id = $1", [wish.id]),
    );
    expect(updated.affectedRows).toBe(0);

    const deleted = await asUser(b, (tx) =>
      tx.query("delete from public.purchase_wishes where id = $1", [wish.id]),
    );
    expect(deleted.affectedRows).toBe(0);

    const after = await db.query<WishRow>(
      "select title from public.purchase_wishes where id = $1",
      [wish.id],
    );
    expect(after.rows[0].title).toBe("ワイヤレスイヤホン");
  });

  it("user_id は更新できない", async () => {
    const a = await createUser();
    const b = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    await expect(
      asUser(a, (tx) =>
        tx.query("update public.purchase_wishes set user_id = $1 where id = $2", [b, wish.id]),
      ),
    ).rejects.toThrow(PERMISSION_DENIED);
    // 列権限を持つ管理者が更新してもトリガーで拒否される
    await expect(
      db.query("update public.purchase_wishes set user_id = $1 where id = $2", [b, wish.id]),
    ).rejects.toThrow(/user_id_is_immutable/);
  });

  it("21件目の希望は wish_limit_reached で拒否される", async () => {
    const a = await createUser();
    await asUser(a, async (tx) => {
      for (let i = 0; i < 20; i++) await insertWish(tx, { title: `希望${i + 1}` });
    });
    await expect(asUser(a, (tx) => insertWish(tx, { title: "希望21" }))).rejects.toThrow(
      /wish_limit_reached/,
    );
    expect(await countAsSuperuser("public.purchase_wishes", "user_id = $1", [a])).toBe(20);
    // 他のユーザーの上限には影響しない
    const b = await createUser();
    await expect(asUser(b, (tx) => insertWish(tx))).resolves.toBeDefined();
  });
});

describe("版の自動採番と wish_revisions", () => {
  it("条件の変更で版が1つ進み、版の記録が追加される", async () => {
    const a = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    const updated = await asUser(a, (tx) =>
      tx.query<WishRow>(
        "update public.purchase_wishes set budget_jpy = 15000 where id = $1 returning version",
        [wish.id],
      ),
    );
    expect(updated.rows[0].version).toBe(2);

    const revisions = await asUser(a, (tx) =>
      tx.query<{ version: number; snapshot: { budgetJpy: number | null } }>(
        "select version, snapshot from public.wish_revisions where wish_id = $1 order by version",
        [wish.id],
      ),
    );
    expect(revisions.rows.map((r) => r.version)).toEqual([1, 2]);
    expect(revisions.rows[0].snapshot.budgetJpy).toBeNull();
    expect(revisions.rows[1].snapshot.budgetJpy).toBe(15000);
  });

  it("状態だけの変更では版は進まない", async () => {
    const a = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    const updated = await asUser(a, (tx) =>
      tx.query<WishRow>(
        "update public.purchase_wishes set status = 'completed' where id = $1 returning version, status",
        [wish.id],
      ),
    );
    expect(updated.rows[0]).toMatchObject({ version: 1, status: "completed" });
    expect(await countAsSuperuser("public.wish_revisions", "wish_id = $1", [wish.id])).toBe(1);
  });

  it("利用者は版番号を直接更新できない", async () => {
    const a = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    await expect(
      asUser(a, (tx) =>
        tx.query("update public.purchase_wishes set version = 99 where id = $1", [wish.id]),
      ),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it("利用者は wish_revisions に直接書き込めず、他人の版は読めない", async () => {
    const a = await createUser();
    const b = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));

    await expect(
      asUser(a, (tx) =>
        tx.query(
          `insert into public.wish_revisions (wish_id, user_id, version, snapshot)
           values ($1, $2, 5, '{}'::jsonb)`,
          [wish.id, a],
        ),
      ),
    ).rejects.toThrow(PERMISSION_DENIED);

    const own = await asUser(a, (tx) =>
      tx.query("select id from public.wish_revisions where wish_id = $1", [wish.id]),
    );
    expect(own.rows).toHaveLength(1);
    const others = await asUser(b, (tx) =>
      tx.query("select id from public.wish_revisions where wish_id = $1", [wish.id]),
    );
    expect(others.rows).toHaveLength(0);
  });
});

describe("feedback", () => {
  const insertFeedback = (tx: Transaction, wishId: string, version: number) =>
    tx.query<{ id: string; user_id: string }>(
      `insert into public.feedback (wish_id, wish_version, outcome, purchased_from)
       values ($1, $2, 'purchased', 'rakuten') returning id, user_id`,
      [wishId, version],
    );

  it("本人は存在する版に対して報告でき、他人は読めない", async () => {
    const a = await createUser();
    const b = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    const fb = await asUser(a, (tx) => insertFeedback(tx, wish.id, 1));
    expect(fb.rows[0].user_id).toBe(a);

    const own = await asUser(a, (tx) =>
      tx.query("select id from public.feedback where id = $1", [fb.rows[0].id]),
    );
    expect(own.rows).toHaveLength(1);
    const others = await asUser(b, (tx) =>
      tx.query("select id from public.feedback where id = $1", [fb.rows[0].id]),
    );
    expect(others.rows).toHaveLength(0);
    const othersDelete = await asUser(b, (tx) =>
      tx.query("delete from public.feedback where id = $1", [fb.rows[0].id]),
    );
    expect(othersDelete.affectedRows).toBe(0);
  });

  it("存在しない版への報告は外部キーで拒否される", async () => {
    const a = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    await expect(asUser(a, (tx) => insertFeedback(tx, wish.id, 2))).rejects.toThrow(
      /feedback_revision_fk/,
    );
  });

  it("他人の wish_id を参照する報告は拒否される", async () => {
    const a = await createUser();
    const b = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    await expect(asUser(b, (tx) => insertFeedback(tx, wish.id, 1))).rejects.toThrow(
      /row-level security|feedback_wish_fk/,
    );
    // user_id に A を指定してもトリガーで B に固定され、同様に拒否される
    await expect(
      asUser(b, (tx) =>
        tx.query(
          `insert into public.feedback (wish_id, user_id, wish_version, outcome)
           values ($1, $2, 1, 'considering')`,
          [wish.id, a],
        ),
      ),
    ).rejects.toThrow(/row-level security|feedback_wish_fk/);
    expect(await countAsSuperuser("public.feedback", "wish_id = $1", [wish.id])).toBe(0);
  });

  it("不正な skip_reasons・結果と購入先の不整合は拒否される", async () => {
    const a = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    await expect(
      asUser(a, (tx) =>
        tx.query(
          `insert into public.feedback (wish_id, wish_version, outcome, skip_reasons)
           values ($1, 1, 'skipped', array['price', 'hacked']::text[])`,
          [wish.id],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(a, (tx) =>
        tx.query(
          `insert into public.feedback (wish_id, wish_version, outcome, purchased_from)
           values ($1, 1, 'skipped', 'amazon')`,
          [wish.id],
        ),
      ),
    ).rejects.toThrow(/feedback_purchase_consistency/);
    await expect(
      asUser(a, (tx) =>
        tx.query(
          `insert into public.feedback (wish_id, wish_version, outcome, skip_reasons)
           values ($1, 1, 'skipped', array['price', 'shipping']::text[])`,
          [wish.id],
        ),
      ),
    ).resolves.toBeDefined();
  });
});

describe("削除の連鎖", () => {
  it("希望を削除すると版と報告も削除される", async () => {
    const a = await createUser();
    const wish = await asUser(a, (tx) => insertWish(tx));
    await asUser(a, async (tx) => {
      await tx.query("update public.purchase_wishes set purpose = '通勤用' where id = $1", [
        wish.id,
      ]);
      await tx.query(
        "insert into public.feedback (wish_id, wish_version, outcome) values ($1, 2, 'considering')",
        [wish.id],
      );
    });
    expect(await countAsSuperuser("public.wish_revisions", "wish_id = $1", [wish.id])).toBe(2);
    expect(await countAsSuperuser("public.feedback", "wish_id = $1", [wish.id])).toBe(1);

    await asUser(a, (tx) => tx.query("delete from public.purchase_wishes where id = $1", [wish.id]));
    expect(await countAsSuperuser("public.wish_revisions", "wish_id = $1", [wish.id])).toBe(0);
    expect(await countAsSuperuser("public.feedback", "wish_id = $1", [wish.id])).toBe(0);
  });
});

describe("anon / 運用メタデータ", () => {
  const tables = [
    "purchase_wishes",
    "wish_revisions",
    "feedback",
    "search_runs",
    "usage_events",
  ] as const;

  it.each(tables)("anon は %s を参照できない", async (table) => {
    await expect(asAnon((tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(
      PERMISSION_DENIED,
    );
  });

  it("anon は各テーブルに書き込めない", async () => {
    const inserts = [
      "insert into public.purchase_wishes (title, category_id) values ('x', 'y')",
      "insert into public.wish_revisions (wish_id, user_id, version, snapshot) values (gen_random_uuid(), gen_random_uuid(), 1, '{}')",
      "insert into public.feedback (wish_id, user_id, wish_version, outcome) values (gen_random_uuid(), gen_random_uuid(), 1, 'considering')",
      "insert into public.search_runs (request_id, ai_used, searched) values ('r', 'none', false)",
      "insert into public.usage_events (event_type) values ('search_started')",
    ];
    for (const sql of inserts) {
      await expect(asAnon((tx) => tx.query(sql))).rejects.toThrow(PERMISSION_DENIED);
    }
  });

  it("authenticated は search_runs / usage_events を参照・書き込みできない", async () => {
    const a = await createUser();
    for (const table of ["search_runs", "usage_events"]) {
      await expect(asUser(a, (tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(
        PERMISSION_DENIED,
      );
    }
    await expect(
      asUser(a, (tx) =>
        tx.query(
          "insert into public.search_runs (request_id, user_id, ai_used, searched) values ('r', $1, 'none', false)",
          [a],
        ),
      ),
    ).rejects.toThrow(PERMISSION_DENIED);
    await expect(
      asUser(a, (tx) =>
        tx.query("insert into public.usage_events (event_type, user_id) values ('wish_saved', $1)", [
          a,
        ]),
      ),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it("RLS 違反の insert は拒否される（明示的な別所有者での with check）", async () => {
    // before insert トリガーは auth.uid() が null のとき所有者を上書きしない。
    // sub を持たない authenticated セッションは with check で拒否されることを確認する。
    const a = await createUser();
    await expect(
      db.transaction(async (tx) => {
        await tx.query("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub', '', true)");
        return insertWish(tx, { user_id: a });
      }),
    ).rejects.toThrow(RLS_VIOLATION);
  });
});

describe("保持期間の削除 purge_expired_records()", () => {
  async function backdate(wishId: string, sql: string) {
    // before update トリガーが updated_at を戻すため、準備時だけトリガーを止める
    await db.transaction(async (tx) => {
      await tx.query("set local session_replication_role = replica");
      await tx.query(sql, [wishId]);
    });
  }

  it("13か月前に更新された希望を削除し、最近の報告がある希望は残す", async () => {
    const a = await createUser();
    const oldWish = await asUser(a, (tx) => insertWish(tx, { title: "古い希望" }));
    const oldButReported = await asUser(a, (tx) => insertWish(tx, { title: "最近報告あり" }));
    const fresh = await asUser(a, (tx) => insertWish(tx, { title: "新しい希望" }));
    await asUser(a, (tx) =>
      tx.query(
        "insert into public.feedback (wish_id, wish_version, outcome) values ($1, 1, 'considering')",
        [oldButReported.id],
      ),
    );
    const backdateSql =
      "update public.purchase_wishes set updated_at = now() - interval '13 months' where id = $1";
    await backdate(oldWish.id, backdateSql);
    await backdate(oldButReported.id, backdateSql);

    const res = await db.query<{ wishes_deleted: number }>(
      "select * from public.purge_expired_records()",
    );
    expect(res.rows[0].wishes_deleted).toBeGreaterThanOrEqual(1);
    expect(await countAsSuperuser("public.purchase_wishes", "id = $1", [oldWish.id])).toBe(0);
    expect(await countAsSuperuser("public.wish_revisions", "wish_id = $1", [oldWish.id])).toBe(0);
    expect(await countAsSuperuser("public.purchase_wishes", "id = $1", [oldButReported.id])).toBe(1);
    expect(await countAsSuperuser("public.purchase_wishes", "id = $1", [fresh.id])).toBe(1);
  });

  it("authenticated / anon は実行できない", async () => {
    const a = await createUser();
    await expect(
      asUser(a, (tx) => tx.query("select * from public.purge_expired_records()")),
    ).rejects.toThrow(PERMISSION_DENIED);
    await expect(
      asAnon((tx) => tx.query("select * from public.purge_expired_records()")),
    ).rejects.toThrow(PERMISSION_DENIED);
  });
});

describe("check 制約", () => {
  it("予算の範囲外は拒否される", async () => {
    const a = await createUser();
    await expect(asUser(a, (tx) => insertWish(tx, { budget_jpy: 0 }))).rejects.toThrow(
      /check constraint/,
    );
    await expect(asUser(a, (tx) => insertWish(tx, { budget_jpy: 10_000_001 }))).rejects.toThrow(
      /check constraint/,
    );
    await expect(asUser(a, (tx) => insertWish(tx, { budget_jpy: 10_000_000 }))).resolves.toMatchObject(
      { user_id: a },
    );
  });
});
