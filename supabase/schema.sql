-- Run once in Supabase SQL Editor. No credentials are stored in this repository.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default ''
);

create table if not exists public.budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null unique,
  published boolean not null default false,
  source text not null default '',
  reported_totals jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.budget_snapshots(id) on delete cascade,
  position integer not null,
  code text not null,
  name text not null,
  agency text not null default '',
  budget numeric(16,2) not null check (budget >= 0),
  approved numeric(16,2) not null check (approved >= 0),
  allocated numeric(16,2) not null check (allocated >= 0),
  unapproved numeric(16,2) not null check (unapproved >= 0),
  unallocated numeric(16,2) not null check (unallocated >= 0),
  status text not null check (status in ('approved','pending','mixed','reserve')),
  reference text not null default '',
  note text not null default '',
  unique (snapshot_id, code)
);

create table if not exists public.budget_audit_log (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.budget_snapshots(id),
  performed_by uuid references auth.users(id),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists budget_items_snapshot_idx on public.budget_items(snapshot_id, position);
create index if not exists snapshots_date_idx on public.budget_snapshots(as_of_date desc);

alter table public.admin_users enable row level security;
alter table public.budget_snapshots enable row level security;
alter table public.budget_items enable row level security;
alter table public.budget_audit_log enable row level security;

drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists published_snapshots_read on public.budget_snapshots;
create policy published_snapshots_read on public.budget_snapshots
  for select to anon, authenticated using (published = true);

drop policy if exists published_items_read on public.budget_items;
create policy published_items_read on public.budget_items
  for select to anon, authenticated using (
    exists (select 1 from public.budget_snapshots s
      where s.id = snapshot_id and s.published = true)
  );

-- Only service_role can execute the atomic replacement RPC. Server API checks
-- both a Supabase Auth token and its membership in admin_users before calling.
create or replace function public.replace_budget_snapshot(
  p_as_of_date date,
  p_published boolean,
  p_source text,
  p_reported_totals jsonb,
  p_items jsonb,
  p_author uuid
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
      or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'Invalid items';
  end if;

  select jsonb_build_object(
    'snapshot', to_jsonb(s),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position)
      from public.budget_items i where i.snapshot_id = s.id), '[]'::jsonb)
  ) into v_before from public.budget_snapshots s where s.as_of_date = p_as_of_date;

  insert into public.budget_snapshots (as_of_date, published, source, reported_totals, updated_by)
  values (p_as_of_date, p_published, p_source, p_reported_totals, p_author)
  on conflict (as_of_date) do update
    set published = excluded.published,
        source = excluded.source,
        reported_totals = excluded.reported_totals,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning id into v_id;

  delete from public.budget_items where snapshot_id = v_id;

  insert into public.budget_items (
    snapshot_id, position, code, name, agency, budget, approved, allocated,
    unapproved, unallocated, status, reference, note
  )
  select v_id, e.ordinality, x.code, x.name, x.agency, x.budget,
    x.approved, x.allocated, x.unapproved, x.unallocated,
    x.status, x.reference, x.note
  from jsonb_array_elements(p_items) with ordinality as e(item, ordinality)
  cross join lateral jsonb_to_record(e.item) as x (
    code text, name text, agency text, budget numeric, approved numeric,
    allocated numeric, unapproved numeric, unallocated numeric,
    status text, reference text, note text
  );

  select jsonb_build_object(
    'snapshot', to_jsonb(s),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position)
      from public.budget_items i where i.snapshot_id = s.id), '[]'::jsonb)
  ) into v_after from public.budget_snapshots s where s.id = v_id;

  insert into public.budget_audit_log(snapshot_id, performed_by, before_state, after_state)
  values (v_id, p_author, v_before, v_after);
  return v_id;
end;
$$;

revoke all on function public.replace_budget_snapshot(date, boolean, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_budget_snapshot(date, boolean, text, jsonb, jsonb, uuid) to service_role;

-- After you invite/create an Auth user in Supabase, grant admin rights using:
-- insert into public.admin_users(user_id, display_name)
-- select id, 'เจ้าหน้าที่งบประมาณ' from auth.users where email = 'YOUR_EMAIL@example.com';
