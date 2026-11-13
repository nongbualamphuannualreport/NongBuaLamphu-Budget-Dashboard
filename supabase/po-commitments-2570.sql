-- FY 2570 PO commitments (encumbrance); values are not cash disbursements.
-- Existing activities, disbursement entries and totals remain unchanged.
create table if not exists public.monitor_po_entries (
  id uuid primary key default gen_random_uuid(),
  activity_id text not null references public.monitor_activities(id),
  po_on date not null,
  amount numeric(16,2) not null check (amount <> 0),
  kind text not null check (kind in ('add','release','pay')),
  reference text not null default '',
  note text not null default '',
  related_payment_id uuid references public.monitor_entries(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists monitor_po_entries_activity_date_idx on public.monitor_po_entries(activity_id,po_on,id);
create index if not exists monitor_po_entries_date_idx on public.monitor_po_entries(po_on);
create table if not exists public.monitor_po_audit (
  id bigint generated always as identity primary key,
  po_entry_id uuid not null,
  action text not null check (action in ('add','release','pay')),
  details jsonb not null,
  by_user uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
alter table public.monitor_po_entries enable row level security;
alter table public.monitor_po_audit enable row level security;
revoke all on public.monitor_po_entries, public.monitor_po_audit from anon, authenticated;
grant select,insert on public.monitor_po_entries,public.monitor_po_audit to service_role;
grant usage,select on sequence public.monitor_po_audit_id_seq to service_role;

-- A single database transaction, with an activity-level lock, validates
-- the historical ledger and writes both sides of a PO payment atomically.
create or replace function public.monitor_apply_po(
 p_activity_id text,p_date date,p_amount numeric,p_kind text,
 p_reference text,p_note text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_activity public.monitor_activities%rowtype;
 v_payment_id uuid;
 v_po_entry public.monitor_po_entries%rowtype;
 v_bad_date date;
 v_po_delta numeric(16,2);
 v_paid_delta numeric(16,2);
begin
 select * into v_activity from public.monitor_activities
 where id=p_activity_id for update;
 if not found or v_activity.project_code='RESERVE' then
  raise exception 'ไม่พบกิจกรรมที่สามารถบันทึก PO ได้';
 end if;
 if p_date is null or p_date<v_activity.baseline_date or p_date>date '2027-09-30' then
  raise exception 'วันที่ PO ต้องอยู่ในช่วงที่เปิดบันทึกข้อมูล';
 end if;
 if p_kind is null or p_kind not in ('add','release','pay')
    or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
    or p_amount>999999999999.99 then
  raise exception 'ประเภทหรือจำนวนเงิน PO ไม่ถูกต้อง';
 end if;
 if length(trim(coalesce(p_reference,'')))=0 and length(trim(coalesce(p_note,'')))=0 then
  raise exception 'กรุณาระบุเลขที่สัญญาหรือเหตุผล/เอกสารอ้างอิง';
 end if;
 v_po_delta:=case when p_kind='add' then p_amount else -p_amount end;
 v_paid_delta:=case when p_kind='pay' then p_amount else 0 end;
 with daily as (
  select day,sum(po_change) po_change,sum(paid_change) paid_change from (
   select po_on as day,amount as po_change,0::numeric as paid_change
     from public.monitor_po_entries where activity_id=p_activity_id
   union all
   select paid_on as day,0::numeric as po_change,amount as paid_change
     from public.monitor_entries where activity_id=p_activity_id
   union all
   select p_date,v_po_delta,v_paid_delta
  ) movements group by day
 ), running as (
  select day,
   sum(po_change) over (order by day) as po_balance,
   v_activity.baseline_disbursed+sum(paid_change) over (order by day) as paid_balance
  from daily
 )
 select min(day) into v_bad_date from running
 where po_balance < 0 or paid_balance < 0
  or paid_balance + po_balance > v_activity.budget + .005;
 if v_bad_date is not null then
  raise exception 'รายการ PO ทำให้ยอดผูกพันหรือเบิกจ่ายไม่ถูกต้อง ณ วันที่ %',v_bad_date;
 end if;
 if p_kind='pay' then
  insert into public.monitor_entries
   (activity_id,paid_on,amount,reference,note,created_by)
   values (p_activity_id,p_date,p_amount,left(coalesce(p_reference,''),300),
     left('จ่ายจาก PO · '||coalesce(p_note,''),1000),p_actor)
   returning id into v_payment_id;
  insert into public.monitor_entry_audit
   (entry_id,action,before_value,after_value,by_user)
   select id,'create',null,to_jsonb(e),p_actor
   from public.monitor_entries e where e.id=v_payment_id;
 end if;
 insert into public.monitor_po_entries
 (activity_id,po_on,amount,kind,reference,note,related_payment_id,created_by)
 values (p_activity_id,p_date,v_po_delta,p_kind,left(coalesce(p_reference,''),300),
  left(coalesce(p_note,''),1000),v_payment_id,p_actor)
 returning * into v_po_entry;
 insert into public.monitor_po_audit(po_entry_id,action,details,by_user)
 values(v_po_entry.id,p_kind,to_jsonb(v_po_entry),p_actor);
 return jsonb_build_object('ok',true,'po_entry_id',v_po_entry.id,'payment_id',v_payment_id);
end;
$$;
revoke all on function public.monitor_apply_po(text,date,numeric,text,text,text,uuid)
 from PUBLIC,anon,authenticated;
grant execute on function public.monitor_apply_po(text,date,numeric,text,text,text,uuid)
 to service_role;
