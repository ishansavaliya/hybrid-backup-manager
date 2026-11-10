-- Admin-managed client accounts and membership. All access is through the
-- Next.js server using the Supabase secret key; browser roles get nothing.
begin;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  phone text not null default '',
  notes text not null default '',
  expires_at timestamptz not null,
  pc_limit int not null default 1 check (pc_limit between 1 and 100),
  blocked boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_logins (
  client_id uuid primary key references public.clients (id) on delete cascade,
  username text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
create unique index client_logins_username_key on public.client_logins (lower(username));

create table public.login_codes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  code_hmac text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_device_id uuid
);
create unique index login_codes_unused_hmac_key on public.login_codes (code_hmac) where used_at is null;
create index login_codes_client_idx on public.login_codes (client_id);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  install_id text not null,
  machine_name text,
  windows_version text,
  app_version text,
  mode text not null check (mode in ('full', 'restore_only')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint devices_client_install_key unique (client_id, install_id)
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index device_tokens_device_idx on public.device_tokens (device_id);

create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null check (actor in ('admin', 'client', 'device', 'system')),
  client_id uuid references public.clients (id) on delete set null,
  device_id uuid,
  action text not null,
  details jsonb not null default '{}',
  ip text not null default ''
);
create index audit_log_client_at_idx on public.audit_log (client_id, at desc);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  failures int not null
);

create table public.settings (
  key text primary key,
  value text not null
);
insert into public.settings (key, value) values ('renew_contact', '');

alter table public.clients enable row level security;
alter table public.client_logins enable row level security;
alter table public.login_codes enable row level security;
alter table public.devices enable row level security;
alter table public.device_tokens enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;
alter table public.settings enable row level security;

revoke all on public.clients, public.client_logins, public.login_codes, public.devices,
  public.device_tokens, public.audit_log, public.rate_limits, public.settings
  from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;

create function public.bkp_register_device(
  p_client_id uuid,
  p_install_id text,
  p_machine text,
  p_windows text,
  p_app_version text,
  p_token_hash text,
  p_now timestamptz
) returns table (outcome text, device_id uuid, mode text, pc_limit int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_mode text;
  v_full_count int;
  v_device_id uuid;
begin
  -- Row lock serialises concurrent registrations so the last PC slot is never double-booked.
  select * into v_client from public.clients c where c.id = p_client_id for update;
  if not found then
    return query select 'client_missing'::text, null::uuid, null::text, null::int;
    return;
  end if;

  if v_client.blocked or v_client.expires_at < p_now then
    v_mode := 'restore_only';
  else
    v_mode := 'full';
    select count(*)::int into v_full_count
      from public.devices d
      where d.client_id = p_client_id
        and d.mode = 'full'
        and d.removed_at is null
        and d.install_id <> p_install_id;
    if v_full_count >= v_client.pc_limit then
      return query select 'pc_limit'::text, null::uuid, null::text, v_client.pc_limit;
      return;
    end if;
  end if;

  insert into public.devices as dv (client_id, install_id, machine_name, windows_version, app_version, mode, first_seen_at, last_seen_at)
  values (p_client_id, p_install_id, p_machine, p_windows, p_app_version, v_mode, p_now, p_now)
  on conflict on constraint devices_client_install_key do update
    set removed_at = null,
        mode = excluded.mode,
        last_seen_at = excluded.last_seen_at,
        machine_name = excluded.machine_name,
        windows_version = excluded.windows_version,
        app_version = excluded.app_version
  returning dv.id into v_device_id;

  -- Re-registering the same PC replaces its session: older tokens stop working.
  update public.device_tokens t
    set revoked_at = p_now
    where t.device_id = v_device_id
      and t.revoked_at is null;

  insert into public.device_tokens (device_id, token_hash, created_at)
  values (v_device_id, p_token_hash, p_now);

  return query select 'ok'::text, v_device_id, v_mode, v_client.pc_limit;
end;
$$;

create function public.bkp_promote_device(
  p_device_id uuid,
  p_now timestamptz
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices%rowtype;
  v_client public.clients%rowtype;
  v_full_count int;
begin
  select * into v_device from public.devices d where d.id = p_device_id;
  if not found then
    return 'removed';
  end if;
  -- Same row lock as registration, so promotion and sign-in never double-book a slot.
  select * into v_client from public.clients c where c.id = v_device.client_id for update;
  select * into v_device from public.devices d where d.id = p_device_id;
  if v_device.removed_at is not null then
    return 'removed';
  end if;
  if v_client.blocked or v_client.expires_at < p_now then
    return v_device.mode;
  end if;
  if v_device.mode = 'full' then
    return 'full';
  end if;
  select count(*)::int into v_full_count
    from public.devices d
    where d.client_id = v_client.id
      and d.mode = 'full'
      and d.removed_at is null
      and d.id <> p_device_id;
  if v_full_count < v_client.pc_limit then
    update public.devices set mode = 'full' where id = p_device_id;
    return 'full';
  end if;
  return 'restore_only';
end;
$$;

create function public.bkp_sign_in_with_code(
  p_code_hmac text,
  p_install_id text,
  p_machine text,
  p_windows text,
  p_app_version text,
  p_token_hash text,
  p_now timestamptz
) returns table (outcome text, client_id uuid, device_id uuid, mode text, pc_limit int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.login_codes%rowtype;
  v_reg record;
begin
  select * into v_code from public.login_codes lc
    where lc.code_hmac = p_code_hmac and lc.used_at is null and lc.expires_at > p_now
    for update;
  if not found then
    return query select 'code_invalid'::text, null::uuid, null::uuid, null::text, null::int;
    return;
  end if;

  select * into v_reg from public.bkp_register_device(
    v_code.client_id, p_install_id, p_machine, p_windows, p_app_version, p_token_hash, p_now);

  if v_reg.outcome = 'ok' then
    update public.login_codes lc
      set used_at = p_now, used_device_id = v_reg.device_id
      where lc.id = v_code.id;
    return query select 'ok'::text, v_code.client_id, v_reg.device_id, v_reg.mode, v_reg.pc_limit;
  else
    return query select v_reg.outcome, v_code.client_id, null::uuid, null::text, v_reg.pc_limit;
  end if;
end;
$$;

create function public.bkp_rate_limited(
  p_key text,
  p_max int,
  p_window_seconds int,
  p_now timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limits%rowtype;
begin
  select * into v_row from public.rate_limits r where r.key = p_key;
  if not found then
    return false;
  end if;
  if v_row.window_start + make_interval(secs => p_window_seconds) <= p_now then
    return false;
  end if;
  return v_row.failures >= p_max;
end;
$$;

create function public.bkp_record_failure(
  p_key text,
  p_window_seconds int,
  p_now timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rate_limits as r (key, window_start, failures)
  values (p_key, p_now, 1)
  on conflict (key) do update
    set window_start = case
          when r.window_start + make_interval(secs => p_window_seconds) <= p_now then p_now
          else r.window_start end,
        failures = case
          when r.window_start + make_interval(secs => p_window_seconds) <= p_now then 1
          else r.failures + 1 end;
end;
$$;

revoke execute on function public.bkp_register_device(uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.bkp_promote_device(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.bkp_sign_in_with_code(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.bkp_rate_limited(text, int, int, timestamptz) from public, anon, authenticated;
revoke execute on function public.bkp_record_failure(text, int, timestamptz) from public, anon, authenticated;

commit;
