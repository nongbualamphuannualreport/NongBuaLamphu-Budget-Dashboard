-- Confirmed project savings: distinct from unspent budget and transferred allocations.
create table if not exists public.monitor_project_savings (
  activity_id text primary key references public.monitor_activities(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  confirmed_on date not null check (confirmed_on between date '2026-11-10' and date '2027-09-30'),
  reference text not null check (length(btrim(reference)) between 1 and 300),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists public.monitor_project_savings_audit (
  id uuid primary key default gen_random_uuid(),
  activity_id text not null,
  action text not null check (action in ('create','update','delete')),
  before_value jsonb,
  after_value jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists monitor_project_savings_date_idx on public.monitor_project_savings(confirmed_on);
create index if not exists monitor_project_savings_audit_activity_idx on public.monitor_project_savings_audit(activity_id,created_at desc);
alter table public.monitor_project_savings enable row level security;
alter table public.monitor_project_savings_audit enable row level security;
revoke all on public.monitor_project_savings from anon, authenticated;
revoke all on public.monitor_project_savings_audit from anon, authenticated;
grant select,insert,update,delete on public.monitor_project_savings to service_role;
grant select,insert on public.monitor_project_savings_audit to service_role;
