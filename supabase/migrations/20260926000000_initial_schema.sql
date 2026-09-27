-- Next AI Agent 初期スキーマ
-- 方針:
-- - 購入希望・条件の版・結果報告は本人だけが閲覧・変更できる（全テーブルRLS）。
-- - 子テーブルは (wish_id, user_id) の複合外部キーで親の所有者と一致させ、他人の wish_id への書き込みを防ぐ。
-- - 商品情報（価格・画像・本文・商品ID）と生の会話は保存しない。
-- - search_runs / usage_events は運用メタデータ。サーバーの管理クライアントだけが書き込む。

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- purchase_wishes: 本人が確認した現在の購入条件と状態
-- ---------------------------------------------------------------------------
create table public.purchase_wishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  title text not null check (char_length(title) between 1 and 80),
  category_id text not null check (char_length(category_id) between 1 and 40),
  product_type text check (product_type is null or char_length(product_type) between 1 and 40),
  purpose text check (purpose is null or char_length(purpose) between 1 and 200),
  budget_jpy integer check (budget_jpy is null or budget_jpy between 1 and 10000000),
  budget_scope text not null default 'unspecified' check (budget_scope in ('item', 'delivered_total', 'unspecified')),
  quantity integer not null default 1 check (quantity between 1 and 99),
  condition text not null default 'any' check (condition in ('new', 'used', 'refurbished', 'any')),
  required jsonb not null default '[]'::jsonb
    check (jsonb_typeof(required) = 'array' and jsonb_array_length(required) <= 12 and octet_length(required::text) <= 4000),
  preferences jsonb not null default '[]'::jsonb
    check (jsonb_typeof(preferences) = 'array' and jsonb_array_length(preferences) <= 10 and octet_length(preferences::text) <= 4000),
  wanted_by date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  last_searched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_wishes_id_user_unique unique (id, user_id)
);

create index purchase_wishes_user_updated_idx on public.purchase_wishes (user_id, updated_at desc);
create index purchase_wishes_updated_idx on public.purchase_wishes (updated_at);

-- ---------------------------------------------------------------------------
-- wish_revisions: 条件変更時の版（本人由来の条件のみ）
-- ---------------------------------------------------------------------------
create table public.wish_revisions (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid not null,
  user_id uuid not null,
  version integer not null check (version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 10000),
  created_at timestamptz not null default now(),
  constraint wish_revisions_wish_fk foreign key (wish_id, user_id)
    references public.purchase_wishes (id, user_id) on delete cascade,
  constraint wish_revisions_version_unique unique (wish_id, version)
);

create index wish_revisions_user_idx on public.wish_revisions (user_id);

-- ---------------------------------------------------------------------------
-- feedback: 結果の自己申告（注文番号・領収書・決済情報は持たない）
-- ---------------------------------------------------------------------------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid not null,
  user_id uuid not null default auth.uid(),
  wish_version integer not null,
  outcome text not null check (outcome in ('purchased', 'skipped', 'considering')),
  purchased_from text check (purchased_from is null or purchased_from in ('rakuten', 'amazon', 'other', 'no_answer')),
  skip_reasons text[] not null default '{}'
    check (
      cardinality(skip_reasons) <= 9
      and skip_reasons <@ array['price', 'shipping', 'size_spec', 'delivery', 'stock', 'preference', 'trust', 'bought_elsewhere', 'other']::text[]
    ),
  comment text check (comment is null or char_length(comment) <= 300),
  -- 候補単位の識別情報は保存しない。どの検索元の候補を見て判断したかだけ任意で記録する。
  source_id text check (source_id is null or source_id in ('rakuten', 'amazon')),
  created_at timestamptz not null default now(),
  constraint feedback_wish_fk foreign key (wish_id, user_id)
    references public.purchase_wishes (id, user_id) on delete cascade,
  constraint feedback_revision_fk foreign key (wish_id, wish_version)
    references public.wish_revisions (wish_id, version) on delete cascade,
  constraint feedback_purchase_consistency check (
    (outcome = 'purchased') or (purchased_from is null)
  ),
  constraint feedback_skip_consistency check (
    (outcome = 'skipped') or (cardinality(skip_reasons) = 0)
  )
);

create index feedback_wish_idx on public.feedback (wish_id, created_at desc);
create index feedback_user_idx on public.feedback (user_id);

-- ---------------------------------------------------------------------------
-- search_runs / usage_events: 運用メタデータ（本文・価格・URLを含めない）
-- ---------------------------------------------------------------------------
create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null check (char_length(request_id) <= 64),
  user_id uuid references auth.users (id) on delete cascade,
  anon_id_hash text check (anon_id_hash is null or char_length(anon_id_hash) <= 64),
  wish_id uuid,
  wish_version integer,
  ai_used text not null check (ai_used in ('llm', 'demo_parser', 'none')),
  searched boolean not null,
  source_outcomes jsonb not null default '{}'::jsonb check (octet_length(source_outcomes::text) <= 2000),
  result_counts jsonb not null default '{}'::jsonb check (octet_length(result_counts::text) <= 1000),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  llm_calls smallint not null default 0,
  llm_input_tokens integer not null default 0,
  llm_output_tokens integer not null default 0,
  provider_calls smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint search_runs_wish_fk foreign key (wish_id, user_id)
    references public.purchase_wishes (id, user_id) on delete cascade
);

create index search_runs_created_idx on public.search_runs (created_at);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'search_started', 'offers_shown', 'wish_saved', 'wish_updated', 'wish_researched',
    'outbound_click', 'feedback_submitted', 'login_completed'
  )),
  user_id uuid references auth.users (id) on delete cascade,
  anon_id_hash text check (anon_id_hash is null or char_length(anon_id_hash) <= 64),
  source_id text check (source_id is null or source_id in ('rakuten', 'amazon')),
  utm_source text check (utm_source is null or utm_source ~ '^[a-z0-9_\-]{1,40}$'),
  utm_medium text check (utm_medium is null or utm_medium ~ '^[a-z0-9_\-]{1,40}$'),
  utm_campaign text check (utm_campaign is null or utm_campaign ~ '^[a-z0-9_\-]{1,40}$'),
  created_at timestamptz not null default now()
);

create index usage_events_created_idx on public.usage_events (created_at);

-- ---------------------------------------------------------------------------
-- トリガー: 所有者・ID・作成日時の変更禁止、版の自動採番、版の記録、件数上限
-- ---------------------------------------------------------------------------
create or replace function public.wish_conditions_snapshot(w public.purchase_wishes)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'title', w.title,
    'categoryId', w.category_id,
    'productType', w.product_type,
    'purpose', w.purpose,
    'budgetJpy', w.budget_jpy,
    'budgetScope', w.budget_scope,
    'quantity', w.quantity,
    'condition', w.condition,
    'required', w.required,
    'preferences', w.preferences,
    'wantedBy', w.wanted_by
  );
$$;

create or replace function public.purchase_wishes_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  existing integer;
begin
  -- 所有者はサーバーの認証から決まる。別の user_id を指定しても本人に固定する（RLSでも拒否される）。
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  select count(*) into existing from public.purchase_wishes where user_id = new.user_id;
  if existing >= 20 then
    raise exception 'wish_limit_reached' using errcode = 'P0001';
  end if;
  new.version := 1;
  new.created_at := now();
  new.updated_at := now();
  new.last_searched_at := null;
  return new;
end;
$$;

create or replace function public.purchase_wishes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id_is_immutable' using errcode = 'P0001';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id_is_immutable' using errcode = 'P0001';
  end if;
  new.created_at := old.created_at;
  -- 条件が変わった場合だけ版を1つ進める。版番号はクライアントから指定させない。
  if public.wish_conditions_snapshot(new) is distinct from public.wish_conditions_snapshot(old) then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    if new.status is distinct from old.status then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;

-- 版の記録は definer 権限で行い、利用者には wish_revisions への直接の書き込み権限を与えない。
create or replace function public.purchase_wishes_record_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.wish_revisions (wish_id, user_id, version, snapshot)
    values (new.id, new.user_id, new.version, public.wish_conditions_snapshot(new))
    on conflict (wish_id, version) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.purchase_wishes_record_revision() from public, anon, authenticated;

create trigger purchase_wishes_before_insert
  before insert on public.purchase_wishes
  for each row execute function public.purchase_wishes_before_insert();

create trigger purchase_wishes_before_update
  before update on public.purchase_wishes
  for each row execute function public.purchase_wishes_before_update();

create trigger purchase_wishes_after_write
  after insert or update on public.purchase_wishes
  for each row execute function public.purchase_wishes_record_revision();

create or replace function public.feedback_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger feedback_before_insert
  before insert on public.feedback
  for each row execute function public.feedback_before_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.purchase_wishes enable row level security;
alter table public.wish_revisions enable row level security;
alter table public.feedback enable row level security;
alter table public.search_runs enable row level security;
alter table public.usage_events enable row level security;

alter table public.purchase_wishes force row level security;
alter table public.feedback force row level security;

revoke all on public.purchase_wishes, public.wish_revisions, public.feedback, public.search_runs, public.usage_events from anon;
revoke all on public.purchase_wishes, public.wish_revisions, public.feedback, public.search_runs, public.usage_events from authenticated;

grant select, insert, delete on public.purchase_wishes to authenticated;
-- 更新できる列を限定する（所有者・版・作成日時は更新できない）。
grant update (title, category_id, product_type, purpose, budget_jpy, budget_scope, quantity, condition,
              required, preferences, wanted_by, status, last_searched_at)
  on public.purchase_wishes to authenticated;
grant select on public.wish_revisions to authenticated;
grant select, insert, delete on public.feedback to authenticated;

create policy purchase_wishes_select_own on public.purchase_wishes
  for select to authenticated using (user_id = (select auth.uid()));
create policy purchase_wishes_insert_own on public.purchase_wishes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy purchase_wishes_update_own on public.purchase_wishes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy purchase_wishes_delete_own on public.purchase_wishes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy wish_revisions_select_own on public.wish_revisions
  for select to authenticated using (user_id = (select auth.uid()));

create policy feedback_select_own on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.purchase_wishes w
      where w.id = wish_id and w.user_id = (select auth.uid())
    )
  );
create policy feedback_delete_own on public.feedback
  for delete to authenticated using (user_id = (select auth.uid()));

-- search_runs / usage_events は利用者向けのポリシーを作らない（管理クライアントのみ）。

-- ---------------------------------------------------------------------------
-- 保持期間: 希望と報告は最終更新から12か月、運用メタデータは30日
-- 定期実行は supabase/sql/schedule-retention.sql（pg_cron）を参照。
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_records(
  wish_retention interval default interval '12 months',
  ops_retention interval default interval '30 days'
)
returns table (wishes_deleted integer, feedback_deleted integer, runs_deleted integer, events_deleted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  w integer; f integer; r integer; e integer;
begin
  -- 希望の最終更新・最後の報告のいずれか新しい方から起算する。
  delete from public.purchase_wishes pw
  where pw.updated_at < now() - wish_retention
    and not exists (
      select 1 from public.feedback fb
      where fb.wish_id = pw.id and fb.created_at >= now() - wish_retention
    );
  get diagnostics w = row_count;
  delete from public.feedback where created_at < now() - wish_retention;
  get diagnostics f = row_count;
  delete from public.search_runs where created_at < now() - ops_retention;
  get diagnostics r = row_count;
  delete from public.usage_events where created_at < now() - ops_retention;
  get diagnostics e = row_count;
  return query select w, f, r, e;
end;
$$;

revoke all on function public.purge_expired_records(interval, interval) from public, anon, authenticated;
