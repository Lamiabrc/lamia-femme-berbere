-- Server-only inbox. Receipt is deliberately separate from order fulfillment.
create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  stripe_object_id text not null,
  stripe_account_id text not null,
  livemode boolean not null,
  stripe_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processed','failed','ignored')),
  processed_at timestamptz,
  payload jsonb not null
);
alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.stripe_webhook_events to service_role;
create index stripe_webhook_events_pending_idx on public.stripe_webhook_events(received_at)
  where processing_status = 'pending';
comment on table public.stripe_webhook_events is
  'Verified Stripe webhook inbox. Private server access only. Pending is not payment fulfillment.';
