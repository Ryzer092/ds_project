-- 保持期間を過ぎた記録の定期削除（任意・公開前に設定する）。
-- Supabase ダッシュボードで pg_cron 拡張を有効にしてから、SQL Editor で実行する。
-- 期間はアプリの説明文（設定画面の「データの扱い」）と一致させること。

create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-records',
  '15 3 * * *', -- 毎日 03:15 UTC
  $$select * from public.purge_expired_records(interval '12 months', interval '30 days');$$
);

-- 確認: select * from cron.job;
-- 解除: select cron.unschedule('purge-expired-records');
