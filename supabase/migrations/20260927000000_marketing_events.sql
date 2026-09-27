-- 紹介サイトの計測イベントを追加する。
-- 記録するのはイベント種別と CTA の位置（固定値）だけで、検索文・メール・URL は保存しない。
alter table public.usage_events drop constraint if exists usage_events_event_type_check;
alter table public.usage_events add constraint usage_events_event_type_check check (event_type in (
  'search_started', 'offers_shown', 'wish_saved', 'wish_updated', 'wish_researched',
  'outbound_click', 'feedback_submitted', 'login_completed',
  'landing_view', 'demo_cta_click', 'demo_started'
));

alter table public.usage_events
  add column if not exists placement text
  check (placement is null or placement in ('header', 'hero', 'preview', 'footer'));
