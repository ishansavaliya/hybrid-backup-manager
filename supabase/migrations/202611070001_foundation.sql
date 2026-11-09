begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check(length(display_name)<=120), created_at timestamptz not null default now()
);
create table public.devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 120), agent_version text, last_seen_at timestamptz,
 public_key text, created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.backup_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, name text not null, schedule jsonb not null default '{"kind":"manual"}', retention jsonb,
 version bigint not null default 1 check(version>0), created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(device_id,user_id) references public.devices(id,user_id) on delete cascade
);
-- Sensitive local paths stay on the agent. These are display labels only.
create table public.backup_sources (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 plan_id uuid not null, display_label text not null, foreign key(plan_id,user_id) references public.backup_plans(id,user_id) on delete cascade
);
create table public.storage_destinations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, name text not null, provider text not null check(provider in ('local','network','s3','google-drive','onedrive','dropbox')),
 capacity_bytes bigint check(capacity_bytes>=0), consumed_bytes bigint check(consumed_bytes>=0), unique(id,user_id),
 foreign key(device_id,user_id) references public.devices(id,user_id) on delete cascade
);
create table public.backup_plan_destinations (
 plan_id uuid not null, destination_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 primary key(plan_id,destination_id),
 foreign key(plan_id,user_id) references public.backup_plans(id,user_id) on delete cascade,
 foreign key(destination_id,user_id) references public.storage_destinations(id,user_id) on delete cascade
);
create table public.backup_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, plan_id uuid not null, status text not null check(status in ('queued','running','succeeded','partial','failed','cancelled','interrupted')),
 started_at timestamptz not null, finished_at timestamptz, logical_bytes bigint check(logical_bytes>=0), changed_bytes bigint check(changed_bytes>=0), unique(id,user_id),
 foreign key(device_id,user_id) references public.devices(id,user_id), foreign key(plan_id,user_id) references public.backup_plans(id,user_id),
 check(finished_at is null or finished_at>=started_at)
);
create table public.destination_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 backup_run_id uuid not null, destination_id uuid not null, status text not null check(status in ('queued','running','succeeded','failed','cancelled','interrupted')), error_code text,
 foreign key(backup_run_id,user_id) references public.backup_runs(id,user_id),foreign key(destination_id,user_id) references public.storage_destinations(id,user_id)
);
create table public.snapshots (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, destination_id uuid not null, restic_id text not null check(restic_id ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null, last_verified_restore_at timestamptz, unique(destination_id,restic_id),unique(id,user_id),
 foreign key(device_id,user_id) references public.devices(id,user_id),foreign key(destination_id,user_id) references public.storage_destinations(id,user_id)
);
-- Requests contain opaque identifiers only. No shell, arbitrary path or credential fields.
create table public.restore_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, snapshot_id uuid not null, status text not null default 'requested' check(status in ('requested','awaiting_local_approval','running','succeeded','failed','cancelled','expired')),
 nonce uuid not null unique default gen_random_uuid(), expires_at timestamptz not null default now()+interval '15 minutes', created_at timestamptz not null default now(),
 foreign key(device_id,user_id) references public.devices(id,user_id),foreign key(snapshot_id,user_id) references public.snapshots(id,user_id)
);
create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade, success boolean not null default false, failure boolean not null default true, warnings boolean not null default true
);
create table public.notification_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null, dedupe_key text not null, status text not null default 'pending' check(status in ('pending','sent','failed','suppressed')),created_at timestamptz not null default now(),unique(user_id,dedupe_key)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 action text not null,resource_id uuid,created_at timestamptz not null default now()
);
-- Default deny for writes until signed agent enrollment and command validation exist.
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid());
grant select on public.profiles to authenticated;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
do $$ declare t text; begin
 foreach t in array array['devices','backup_plans','backup_sources','storage_destinations','backup_plan_destinations','backup_runs','destination_runs','snapshots','restore_jobs','notification_preferences','notification_events','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(user_id = auth.uid())',t);
 execute format('create index %I on public.%I(user_id)',t||'_owner_idx',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create index devices_last_seen on public.devices(last_seen_at);
create index backup_runs_history on public.backup_runs(user_id,started_at desc);
create index snapshots_history on public.snapshots(user_id,created_at desc);
commit;
