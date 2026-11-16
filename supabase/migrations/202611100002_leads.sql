-- "Connect with Bakvion experts" enquiries from the website and the desktop app.
-- Server-only, like every other table: browser roles get nothing.
begin;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null check (source in ('website', 'app')),
  name text not null,
  business text not null,
  phone text not null,
  email text not null default '',
  city text not null default '',
  pcs int check (pcs between 1 and 100),
  message text not null default '',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'converted', 'not_interested')),
  email_sent boolean not null default false,
  ip text not null default '',
  install_id text not null default '',
  app_version text not null default '',
  client_id uuid references public.clients (id) on delete set null
);
create index leads_status_created_idx on public.leads (status, created_at desc);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

commit;
