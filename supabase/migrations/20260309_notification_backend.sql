create extension if not exists pgcrypto;

create table if not exists public.notification_targets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  channel text not null check (channel in ('in_app', 'email', 'email_to_sms', 'sms')),
  destination text not null,
  role_scope text not null default 'Conductor' check (role_scope in ('Admin', 'Conductor', 'Publisher', 'All')),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.notification_providers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  channel text not null check (channel in ('email', 'email_to_sms')),
  provider_type text not null default 'resend',
  sender_identity text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id text primary key,
  kind text not null,
  ran_at timestamptz not null default now(),
  source text,
  summary_title text,
  summary_detail text,
  delivery_detail text,
  counts jsonb not null default '{}'::jsonb
);

create table if not exists public.notification_queue (
  id text primary key,
  run_id text,
  user_id uuid references auth.users(id),
  role_scope text default 'All',
  channel text not null check (channel in ('in_app', 'email', 'email_to_sms', 'sms')),
  territory_id text,
  territory_no text,
  locality text,
  threshold integer,
  days_in_pool integer,
  message text not null,
  status text not null default 'queued' check (status in ('queued', 'dispatched', 'acknowledged', 'failed')),
  fallback_channel text,
  gateway_type text,
  provider_label text,
  route_target text,
  attempt_count integer not null default 0,
  provider_message_id text,
  last_attempt_at timestamptz,
  failure_reason text,
  delivery_state text default 'queued',
  delivery_state_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  delivery_targets jsonb not null default '[]'::jsonb,
  delivery_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_targets enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_providers enable row level security;
alter table public.automation_runs enable row level security;
alter table public.notification_queue enable row level security;

create policy if not exists "notification targets admin conductor read"
on public.notification_targets for select
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));

create policy if not exists "notification targets admin write"
on public.notification_targets for all
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'Admin'))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'Admin'));


create policy if not exists "notification providers admin conductor read"
on public.notification_providers for select
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));

create policy if not exists "notification providers admin write"
on public.notification_providers for all
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'Admin'))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'Admin'));

create policy if not exists "automation runs admin conductor read"
on public.automation_runs for select
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));

create policy if not exists "automation runs admin conductor write"
on public.automation_runs for all
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));


create table if not exists public.notification_events (
  id text primary key,
  notification_id text references public.notification_queue(id) on delete cascade,
  provider_message_id text,
  provider text,
  event_type text not null,
  route_target text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create policy if not exists "notification queue admin conductor read"
on public.notification_queue for select
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));


create policy if not exists "notification events admin conductor read"
on public.notification_events for select
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));

create policy if not exists "notification events admin conductor write"
on public.notification_events for all
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));

create policy if not exists "notification queue admin conductor write"
on public.notification_queue for all
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('Admin', 'Conductor')));

alter table public.user_roles
add column if not exists phone_number text,
add column if not exists carrier text,
add column if not exists sms_gateway_opt_in boolean default false,
add column if not exists sms_gateway_status text default 'unknown',
add column if not exists sms_gateway_last_checked_at timestamptz,
add column if not exists preferred_notification_method text default 'email';
