-- ADDITIVE migration. Safe for the existing allocation tables.
create table if not exists public.disbursement_reports (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null unique,
  published boolean not null default false,
  report jsonb not null,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists disbursement_reports_date_idx on public.disbursement_reports (as_of_date desc);
alter table public.disbursement_reports enable row level security;
drop policy if exists public_disbursement_read on public.disbursement_reports;
create policy public_disbursement_read on public.disbursement_reports for select to anon, authenticated using (published = true);
-- No client INSERT/UPDATE/DELETE grants; mutations run only through server routes after verifyAdmin.
revoke insert, update, delete on public.disbursement_reports from anon, authenticated;
