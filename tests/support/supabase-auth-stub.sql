-- PGlite 上で Supabase の実行環境を最小限に再現するスタブ（テスト専用）。
-- マイグレーションの適用前に、既定ロール（postgres = PGlite の superuser）で実行する。

-- Supabase の API ロール
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

-- auth スキーマ（GoTrue が持つテーブルの最小限）
create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text
);

-- Supabase の auth.uid() と同じく、JWT の sub を request.jwt.claim.sub または request.jwt.claims から読む
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase は public スキーマの新規オブジェクトを API ロールへ既定で付与する。
-- マイグレーション側の revoke が実際に効いていることを確かめるため、同じ既定権限を再現する。
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
