-- Backup run reports from the desktop app, emailed to the client's addresses.
-- Server-only, like every other table: browser roles get nothing.
begin;

alter table public.devices
  add column report_emails text[] not null default '{}'
    check (cardinality(report_emails) <= 3),
  add column report_mode text not null default 'all'
    check (report_mode in ('all', 'failures', 'off'));

create table public.backup_reports (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  run_id text not null,
  plan_name text not null,
  destination_name text not null,
  schedule_kind text not null check (schedule_kind in ('manual','hourly','daily','weekly')),
  state text not null check (state in ('succeeded','failed','interrupted')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  error text not null default '',
  notes text not null default '',
  received_at timestamptz not null default now(),
  email_status text not null default 'pending'
    check (email_status in ('pending','digest','sent','skipped','failed')),
  constraint backup_reports_device_run_key unique (device_id, run_id)
);
create index backup_reports_device_finished_idx on public.backup_reports (device_id, finished_at desc);
create index backup_reports_digest_idx on public.backup_reports (email_status) where email_status = 'digest';
alter table public.backup_reports enable row level security;
revoke all on public.backup_reports from anon, authenticated;
commit;
