-- Additional tables only. Run in the SAME Supabase project as /admin.
-- Does not drop or change existing budget/disbursement tables.
create table if not exists public.monitor_activities (
  id text primary key,
  project_code text not null,
  project_name text not null,
  name text not null,
  agency text not null default '',
  budget numeric(16,2) not null check (budget >= 0),
  baseline_disbursed numeric(16,2) not null default 0 check (baseline_disbursed >= 0),
  baseline_date date not null,
  fiscal_year integer not null default 2570,
  source_row integer,
  constraint monitor_baseline_not_over_budget check (baseline_disbursed <= budget)
);
create table if not exists public.monitor_entries (
  id uuid primary key default gen_random_uuid(),
  activity_id text not null references public.monitor_activities(id),
  paid_on date not null,
  amount numeric(16,2) not null check (amount > 0),
  reference text not null default '',
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists monitor_entries_paid_on_idx on public.monitor_entries(paid_on);
create index if not exists monitor_entries_activity_idx on public.monitor_entries(activity_id);
create table if not exists public.monitor_entry_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  action text not null check (action in ('create','update','delete')),
  before_value jsonb,
  after_value jsonb,
  by_user uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
alter table public.monitor_activities enable row level security;
alter table public.monitor_entries enable row level security;
alter table public.monitor_entry_audit enable row level security;
-- Only the server-side service-role key can read or write these tables.
revoke all on public.monitor_activities, public.monitor_entries, public.monitor_entry_audit from anon, authenticated;
-- Supabase service role is the only permitted data API principal.
grant select,insert,update,delete on public.monitor_activities,public.monitor_entries,public.monitor_entry_audit to service_role;
grant usage,select on all sequences in schema public to service_role;
