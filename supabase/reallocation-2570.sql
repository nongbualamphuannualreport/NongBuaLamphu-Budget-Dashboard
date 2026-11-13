-- Reserve-funded projects for FY2570. This migration does not alter any existing budget amount.
-- A transfer is represented by an immutable ledger row; reserve's source budget
-- stays 672,700 in monitor_activities, and reports subtract dated allocations.
create table if not exists public.monitor_reallocation_transfers (
 id uuid primary key default gen_random_uuid(),
 activity_id text not null unique references public.monitor_activities(id),
 project_code text not null check(project_code ~ '^T[0-9]{2,3},
 project_name text not null,
 activity_name text not null,
 agency text not null default '',
 allocated_on date not null,
 amount numeric(16,2) not null check(amount>0),
 reference text not null check(length(btrim(reference))>0),
 note text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 cancelled_on date,
 cancelled_reason text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz
);
create index if not exists monitor_reallocation_date_idx on public.monitor_reallocation_transfers(allocated_on,id);
create index if not exists monitor_reallocation_project_idx on public.monitor_reallocation_transfers(project_code);
alter table public.monitor_reallocation_transfers enable row level security;
revoke all on public.monitor_reallocation_transfers from anon, authenticated;
grant select,insert on public.monitor_reallocation_transfers to service_role;

-- Atomic, serialised fund allocation; ensures no double counting or over-allocation.
-- The activity budget increases but the reported reserve decreases by exactly
-- the same transfer. The reserve source record is never destroyed or overwritten.
create or replace function public.monitor_allocate_reserve(
 p_project_code text, p_project_name text, p_activity_name text,
 p_agency text, p_allocated_on date, p_amount numeric,
 p_reference text, p_note text, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_project text;
 v_seq integer;
 v_used numeric(16,2);
 v_activity_id text;
 v_transfer public.monitor_reallocation_transfers%rowtype;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE'
 for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือจากการโอนเปลี่ยนแปลง'; end if;
 if p_allocated_on is null or p_allocated_on<v_reserve.baseline_date or p_allocated_on>date '2027-09-30'
   then raise exception 'วันที่โอนเปลี่ยนแปลงอยู่นอกช่วงที่อนุญาต'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
   or p_amount>999999999999.99 then raise exception 'จำนวนเงินโอนเปลี่ยนแปลงไม่ถูกต้อง'; end if;
 if p_activity_name is null or length(btrim(p_activity_name))=0
   or length(p_activity_name)>500 then raise exception 'กรุณาระบุชื่อกิจกรรม'; end if;
 if p_reference is null or length(btrim(p_reference))=0 or length(p_reference)>300
   then raise exception 'ต้องมีเลขที่หนังสือหรือเอกสารอนุมัติการโอน'; end if;
 if p_project_code is null or btrim(p_project_code)='' then
   if p_project_name is null or length(btrim(p_project_name))=0 or length(p_project_name)>350
     then raise exception 'กรุณาระบุชื่อโครงการใหม่'; end if;
   select coalesce(max(substring(project_code from 2)::integer),0)+1 into v_seq
   from public.monitor_activities where project_code~'^T[0-9]{2,3}$';
   if v_seq>999 then raise exception 'รหัสโครงการจากเงินโอนเต็มแล้ว'; end if;
   v_code:='T'||lpad(v_seq::text,2,'0');
   v_project:=btrim(p_project_name);
 else
   v_code:=upper(btrim(p_project_code));
   if (v_code!~'^T[0-9]{2,3}
    select 1 from public.monitor_reallocation_transfers where project_code=v_code and cancelled_on is null
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers where cancelled_on is null;
 if v_used+p_amount>v_reserve.budget+.005
   then raise exception 'วงเงินคงเหลือไม่เพียงพอ คงเหลือ % บาท',v_reserve.budget-v_used; end if;
 v_activity_id:='FY2570-TR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.monitor_activities
  (id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_amount,0,p_allocated_on,2570,null);
 insert into public.monitor_reallocation_transfers
  (activity_id,project_code,project_name,activity_name,agency,allocated_on,amount,reference,note,created_by)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_allocated_on,p_amount,btrim(p_reference),left(coalesce(p_note,''),1000),p_actor)
 returning * into v_transfer;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'create',null,
        jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),p_actor);
 return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'activity_id',v_activity_id,
                          'project_code',v_code,'reserve_remaining',v_reserve.budget-v_used-p_amount);
end;
$$;
revoke all on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 to service_role;


-- Cancel an entire reserve-funded project and return its allocation without deleting history.
-- Cancellation is not allowed if any disbursement or PO was recorded for its activities.
create or replace function public.monitor_cancel_reserve_project(
 p_project_code text,p_cancelled_on date,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_count integer;
 v_amount numeric(16,2);
 v_latest date;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือ'; end if;
 v_code:=upper(btrim(coalesce(p_project_code,'')));
 if (v_code!~'^T[0-9]{2,3} or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
 or project_code='P11'),
 project_name text not null,
 activity_name text not null,
 agency text not null default '',
 allocated_on date not null,
 amount numeric(16,2) not null check(amount>0),
 reference text not null check(length(btrim(reference))>0),
 note text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 cancelled_on date,
 cancelled_reason text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz
);
create index if not exists monitor_reallocation_date_idx on public.monitor_reallocation_transfers(allocated_on,id);
create index if not exists monitor_reallocation_project_idx on public.monitor_reallocation_transfers(project_code);
alter table public.monitor_reallocation_transfers enable row level security;
revoke all on public.monitor_reallocation_transfers from anon, authenticated;
grant select,insert on public.monitor_reallocation_transfers to service_role;

-- Atomic, serialised fund allocation; ensures no double counting or over-allocation.
-- The activity budget increases but the reported reserve decreases by exactly
-- the same transfer. The reserve source record is never destroyed or overwritten.
create or replace function public.monitor_allocate_reserve(
 p_project_code text, p_project_name text, p_activity_name text,
 p_agency text, p_allocated_on date, p_amount numeric,
 p_reference text, p_note text, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_project text;
 v_seq integer;
 v_used numeric(16,2);
 v_activity_id text;
 v_transfer public.monitor_reallocation_transfers%rowtype;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE'
 for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือจากการโอนเปลี่ยนแปลง'; end if;
 if p_allocated_on is null or p_allocated_on<v_reserve.baseline_date or p_allocated_on>date '2027-09-30'
   then raise exception 'วันที่โอนเปลี่ยนแปลงอยู่นอกช่วงที่อนุญาต'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
   or p_amount>999999999999.99 then raise exception 'จำนวนเงินโอนเปลี่ยนแปลงไม่ถูกต้อง'; end if;
 if p_activity_name is null or length(btrim(p_activity_name))=0
   or length(p_activity_name)>500 then raise exception 'กรุณาระบุชื่อกิจกรรม'; end if;
 if p_reference is null or length(btrim(p_reference))=0 or length(p_reference)>300
   then raise exception 'ต้องมีเลขที่หนังสือหรือเอกสารอนุมัติการโอน'; end if;
 if p_project_code is null or btrim(p_project_code)='' then
   if p_project_name is null or length(btrim(p_project_name))=0 or length(p_project_name)>350
     then raise exception 'กรุณาระบุชื่อโครงการใหม่'; end if;
   select coalesce(max(substring(project_code from 2)::integer),0)+1 into v_seq
   from public.monitor_activities where project_code~'^T[0-9]{2,3}$';
   if v_seq>999 then raise exception 'รหัสโครงการจากเงินโอนเต็มแล้ว'; end if;
   v_code:='T'||lpad(v_seq::text,2,'0');
   v_project:=btrim(p_project_name);
 else
   v_code:=upper(btrim(p_project_code));
   if v_code!~'^T[0-9]{2,3}$' or not exists(
    select 1 from public.monitor_reallocation_transfers where project_code=v_code and cancelled_on is null
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers where cancelled_on is null;
 if v_used+p_amount>v_reserve.budget+.005
   then raise exception 'วงเงินคงเหลือไม่เพียงพอ คงเหลือ % บาท',v_reserve.budget-v_used; end if;
 v_activity_id:='FY2570-TR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.monitor_activities
  (id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_amount,0,p_allocated_on,2570,null);
 insert into public.monitor_reallocation_transfers
  (activity_id,project_code,project_name,activity_name,agency,allocated_on,amount,reference,note,created_by)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_allocated_on,p_amount,btrim(p_reference),left(coalesce(p_note,''),1000),p_actor)
 returning * into v_transfer;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'create',null,
        jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),p_actor);
 return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'activity_id',v_activity_id,
                          'project_code',v_code,'reserve_remaining',v_reserve.budget-v_used-p_amount);
end;
$$;
revoke all on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 to service_role;


-- Cancel an entire reserve-funded project and return its allocation without deleting history.
-- Cancellation is not allowed if any disbursement or PO was recorded for its activities.
create or replace function public.monitor_cancel_reserve_project(
 p_project_code text,p_cancelled_on date,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_count integer;
 v_amount numeric(16,2);
 v_latest date;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือ'; end if;
 v_code:=upper(btrim(coalesce(p_project_code,'')));
 if v_code!~'^T[0-9]{2,3}$' or p_reason is null or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
 and v_code<>'P11') or not exists(
    select 1 from public.monitor_reallocation_transfers where project_code=v_code and cancelled_on is null
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers where cancelled_on is null;
 if v_used+p_amount>v_reserve.budget+.005
   then raise exception 'วงเงินคงเหลือไม่เพียงพอ คงเหลือ % บาท',v_reserve.budget-v_used; end if;
 v_activity_id:='FY2570-TR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.monitor_activities
  (id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_amount,0,p_allocated_on,2570,null);
 insert into public.monitor_reallocation_transfers
  (activity_id,project_code,project_name,activity_name,agency,allocated_on,amount,reference,note,created_by)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_allocated_on,p_amount,btrim(p_reference),left(coalesce(p_note,''),1000),p_actor)
 returning * into v_transfer;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'create',null,
        jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),p_actor);
 return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'activity_id',v_activity_id,
                          'project_code',v_code,'reserve_remaining',v_reserve.budget-v_used-p_amount);
end;
$$;
revoke all on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 to service_role;


-- Cancel an entire reserve-funded project and return its allocation without deleting history.
-- Cancellation is not allowed if any disbursement or PO was recorded for its activities.
create or replace function public.monitor_cancel_reserve_project(
 p_project_code text,p_cancelled_on date,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_count integer;
 v_amount numeric(16,2);
 v_latest date;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือ'; end if;
 v_code:=upper(btrim(coalesce(p_project_code,'')));
 if v_code!~'^T[0-9]{2,3}$' or p_reason is null or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
 or project_code='P11'),
 project_name text not null,
 activity_name text not null,
 agency text not null default '',
 allocated_on date not null,
 amount numeric(16,2) not null check(amount>0),
 reference text not null check(length(btrim(reference))>0),
 note text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 cancelled_on date,
 cancelled_reason text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz
);
create index if not exists monitor_reallocation_date_idx on public.monitor_reallocation_transfers(allocated_on,id);
create index if not exists monitor_reallocation_project_idx on public.monitor_reallocation_transfers(project_code);
alter table public.monitor_reallocation_transfers enable row level security;
revoke all on public.monitor_reallocation_transfers from anon, authenticated;
grant select,insert on public.monitor_reallocation_transfers to service_role;

-- Atomic, serialised fund allocation; ensures no double counting or over-allocation.
-- The activity budget increases but the reported reserve decreases by exactly
-- the same transfer. The reserve source record is never destroyed or overwritten.
create or replace function public.monitor_allocate_reserve(
 p_project_code text, p_project_name text, p_activity_name text,
 p_agency text, p_allocated_on date, p_amount numeric,
 p_reference text, p_note text, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_project text;
 v_seq integer;
 v_used numeric(16,2);
 v_activity_id text;
 v_transfer public.monitor_reallocation_transfers%rowtype;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE'
 for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือจากการโอนเปลี่ยนแปลง'; end if;
 if p_allocated_on is null or p_allocated_on<v_reserve.baseline_date or p_allocated_on>date '2027-09-30'
   then raise exception 'วันที่โอนเปลี่ยนแปลงอยู่นอกช่วงที่อนุญาต'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
   or p_amount>999999999999.99 then raise exception 'จำนวนเงินโอนเปลี่ยนแปลงไม่ถูกต้อง'; end if;
 if p_activity_name is null or length(btrim(p_activity_name))=0
   or length(p_activity_name)>500 then raise exception 'กรุณาระบุชื่อกิจกรรม'; end if;
 if p_reference is null or length(btrim(p_reference))=0 or length(p_reference)>300
   then raise exception 'ต้องมีเลขที่หนังสือหรือเอกสารอนุมัติการโอน'; end if;
 if p_project_code is null or btrim(p_project_code)='' then
   if p_project_name is null or length(btrim(p_project_name))=0 or length(p_project_name)>350
     then raise exception 'กรุณาระบุชื่อโครงการใหม่'; end if;
   select coalesce(max(substring(project_code from 2)::integer),0)+1 into v_seq
   from public.monitor_activities where project_code~'^T[0-9]{2,3}$';
   if v_seq>999 then raise exception 'รหัสโครงการจากเงินโอนเต็มแล้ว'; end if;
   v_code:='T'||lpad(v_seq::text,2,'0');
   v_project:=btrim(p_project_name);
 else
   v_code:=upper(btrim(p_project_code));
   if v_code!~'^T[0-9]{2,3}$' or not exists(
    select 1 from public.monitor_reallocation_transfers where project_code=v_code and cancelled_on is null
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers where cancelled_on is null;
 if v_used+p_amount>v_reserve.budget+.005
   then raise exception 'วงเงินคงเหลือไม่เพียงพอ คงเหลือ % บาท',v_reserve.budget-v_used; end if;
 v_activity_id:='FY2570-TR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.monitor_activities
  (id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_amount,0,p_allocated_on,2570,null);
 insert into public.monitor_reallocation_transfers
  (activity_id,project_code,project_name,activity_name,agency,allocated_on,amount,reference,note,created_by)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_allocated_on,p_amount,btrim(p_reference),left(coalesce(p_note,''),1000),p_actor)
 returning * into v_transfer;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'create',null,
        jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),p_actor);
 return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'activity_id',v_activity_id,
                          'project_code',v_code,'reserve_remaining',v_reserve.budget-v_used-p_amount);
end;
$$;
revoke all on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 to service_role;


-- Cancel an entire reserve-funded project and return its allocation without deleting history.
-- Cancellation is not allowed if any disbursement or PO was recorded for its activities.
create or replace function public.monitor_cancel_reserve_project(
 p_project_code text,p_cancelled_on date,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_count integer;
 v_amount numeric(16,2);
 v_latest date;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือ'; end if;
 v_code:=upper(btrim(coalesce(p_project_code,'')));
 if v_code!~'^T[0-9]{2,3}$' or p_reason is null or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
 and v_code<>'P11') or p_reason is null or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
 or project_code='P11'),
 project_name text not null,
 activity_name text not null,
 agency text not null default '',
 allocated_on date not null,
 amount numeric(16,2) not null check(amount>0),
 reference text not null check(length(btrim(reference))>0),
 note text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 cancelled_on date,
 cancelled_reason text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz
);
create index if not exists monitor_reallocation_date_idx on public.monitor_reallocation_transfers(allocated_on,id);
create index if not exists monitor_reallocation_project_idx on public.monitor_reallocation_transfers(project_code);
alter table public.monitor_reallocation_transfers enable row level security;
revoke all on public.monitor_reallocation_transfers from anon, authenticated;
grant select,insert on public.monitor_reallocation_transfers to service_role;

-- Atomic, serialised fund allocation; ensures no double counting or over-allocation.
-- The activity budget increases but the reported reserve decreases by exactly
-- the same transfer. The reserve source record is never destroyed or overwritten.
create or replace function public.monitor_allocate_reserve(
 p_project_code text, p_project_name text, p_activity_name text,
 p_agency text, p_allocated_on date, p_amount numeric,
 p_reference text, p_note text, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_project text;
 v_seq integer;
 v_used numeric(16,2);
 v_activity_id text;
 v_transfer public.monitor_reallocation_transfers%rowtype;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE'
 for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือจากการโอนเปลี่ยนแปลง'; end if;
 if p_allocated_on is null or p_allocated_on<v_reserve.baseline_date or p_allocated_on>date '2027-09-30'
   then raise exception 'วันที่โอนเปลี่ยนแปลงอยู่นอกช่วงที่อนุญาต'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
   or p_amount>999999999999.99 then raise exception 'จำนวนเงินโอนเปลี่ยนแปลงไม่ถูกต้อง'; end if;
 if p_activity_name is null or length(btrim(p_activity_name))=0
   or length(p_activity_name)>500 then raise exception 'กรุณาระบุชื่อกิจกรรม'; end if;
 if p_reference is null or length(btrim(p_reference))=0 or length(p_reference)>300
   then raise exception 'ต้องมีเลขที่หนังสือหรือเอกสารอนุมัติการโอน'; end if;
 if p_project_code is null or btrim(p_project_code)='' then
   if p_project_name is null or length(btrim(p_project_name))=0 or length(p_project_name)>350
     then raise exception 'กรุณาระบุชื่อโครงการใหม่'; end if;
   select coalesce(max(substring(project_code from 2)::integer),0)+1 into v_seq
   from public.monitor_activities where project_code~'^T[0-9]{2,3}$';
   if v_seq>999 then raise exception 'รหัสโครงการจากเงินโอนเต็มแล้ว'; end if;
   v_code:='T'||lpad(v_seq::text,2,'0');
   v_project:=btrim(p_project_name);
 else
   v_code:=upper(btrim(p_project_code));
   if v_code!~'^T[0-9]{2,3}$' or not exists(
    select 1 from public.monitor_reallocation_transfers where project_code=v_code and cancelled_on is null
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers where cancelled_on is null;
 if v_used+p_amount>v_reserve.budget+.005
   then raise exception 'วงเงินคงเหลือไม่เพียงพอ คงเหลือ % บาท',v_reserve.budget-v_used; end if;
 v_activity_id:='FY2570-TR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.monitor_activities
  (id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_amount,0,p_allocated_on,2570,null);
 insert into public.monitor_reallocation_transfers
  (activity_id,project_code,project_name,activity_name,agency,allocated_on,amount,reference,note,created_by)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_allocated_on,p_amount,btrim(p_reference),left(coalesce(p_note,''),1000),p_actor)
 returning * into v_transfer;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'create',null,
        jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),p_actor);
 return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'activity_id',v_activity_id,
                          'project_code',v_code,'reserve_remaining',v_reserve.budget-v_used-p_amount);
end;
$$;
revoke all on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 to service_role;


-- Cancel an entire reserve-funded project and return its allocation without deleting history.
-- Cancellation is not allowed if any disbursement or PO was recorded for its activities.
create or replace function public.monitor_cancel_reserve_project(
 p_project_code text,p_cancelled_on date,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_count integer;
 v_amount numeric(16,2);
 v_latest date;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือ'; end if;
 v_code:=upper(btrim(coalesce(p_project_code,'')));
 if v_code!~'^T[0-9]{2,3}$' or p_reason is null or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
 and v_code<>'P11') or not exists(
    select 1 from public.monitor_reallocation_transfers where project_code=v_code and cancelled_on is null
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers where cancelled_on is null;
 if v_used+p_amount>v_reserve.budget+.005
   then raise exception 'วงเงินคงเหลือไม่เพียงพอ คงเหลือ % บาท',v_reserve.budget-v_used; end if;
 v_activity_id:='FY2570-TR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.monitor_activities
  (id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_amount,0,p_allocated_on,2570,null);
 insert into public.monitor_reallocation_transfers
  (activity_id,project_code,project_name,activity_name,agency,allocated_on,amount,reference,note,created_by)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_allocated_on,p_amount,btrim(p_reference),left(coalesce(p_note,''),1000),p_actor)
 returning * into v_transfer;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'create',null,
        jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),p_actor);
 return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'activity_id',v_activity_id,
                          'project_code',v_code,'reserve_remaining',v_reserve.budget-v_used-p_amount);
end;
$$;
revoke all on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 to service_role;


-- Cancel an entire reserve-funded project and return its allocation without deleting history.
-- Cancellation is not allowed if any disbursement or PO was recorded for its activities.
create or replace function public.monitor_cancel_reserve_project(
 p_project_code text,p_cancelled_on date,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_count integer;
 v_amount numeric(16,2);
 v_latest date;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือ'; end if;
 v_code:=upper(btrim(coalesce(p_project_code,'')));
 if v_code!~'^T[0-9]{2,3}$' or p_reason is null or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
 or project_code='P11'),
 project_name text not null,
 activity_name text not null,
 agency text not null default '',
 allocated_on date not null,
 amount numeric(16,2) not null check(amount>0),
 reference text not null check(length(btrim(reference))>0),
 note text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 cancelled_on date,
 cancelled_reason text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz
);
create index if not exists monitor_reallocation_date_idx on public.monitor_reallocation_transfers(allocated_on,id);
create index if not exists monitor_reallocation_project_idx on public.monitor_reallocation_transfers(project_code);
alter table public.monitor_reallocation_transfers enable row level security;
revoke all on public.monitor_reallocation_transfers from anon, authenticated;
grant select,insert on public.monitor_reallocation_transfers to service_role;

-- Atomic, serialised fund allocation; ensures no double counting or over-allocation.
-- The activity budget increases but the reported reserve decreases by exactly
-- the same transfer. The reserve source record is never destroyed or overwritten.
create or replace function public.monitor_allocate_reserve(
 p_project_code text, p_project_name text, p_activity_name text,
 p_agency text, p_allocated_on date, p_amount numeric,
 p_reference text, p_note text, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_project text;
 v_seq integer;
 v_used numeric(16,2);
 v_activity_id text;
 v_transfer public.monitor_reallocation_transfers%rowtype;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE'
 for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือจากการโอนเปลี่ยนแปลง'; end if;
 if p_allocated_on is null or p_allocated_on<v_reserve.baseline_date or p_allocated_on>date '2027-09-30'
   then raise exception 'วันที่โอนเปลี่ยนแปลงอยู่นอกช่วงที่อนุญาต'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
   or p_amount>999999999999.99 then raise exception 'จำนวนเงินโอนเปลี่ยนแปลงไม่ถูกต้อง'; end if;
 if p_activity_name is null or length(btrim(p_activity_name))=0
   or length(p_activity_name)>500 then raise exception 'กรุณาระบุชื่อกิจกรรม'; end if;
 if p_reference is null or length(btrim(p_reference))=0 or length(p_reference)>300
   then raise exception 'ต้องมีเลขที่หนังสือหรือเอกสารอนุมัติการโอน'; end if;
 if p_project_code is null or btrim(p_project_code)='' then
   if p_project_name is null or length(btrim(p_project_name))=0 or length(p_project_name)>350
     then raise exception 'กรุณาระบุชื่อโครงการใหม่'; end if;
   select coalesce(max(substring(project_code from 2)::integer),0)+1 into v_seq
   from public.monitor_activities where project_code~'^T[0-9]{2,3}$';
   if v_seq>999 then raise exception 'รหัสโครงการจากเงินโอนเต็มแล้ว'; end if;
   v_code:='T'||lpad(v_seq::text,2,'0');
   v_project:=btrim(p_project_name);
 else
   v_code:=upper(btrim(p_project_code));
   if v_code!~'^T[0-9]{2,3}$' or not exists(
    select 1 from public.monitor_reallocation_transfers where project_code=v_code and cancelled_on is null
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers where cancelled_on is null;
 if v_used+p_amount>v_reserve.budget+.005
   then raise exception 'วงเงินคงเหลือไม่เพียงพอ คงเหลือ % บาท',v_reserve.budget-v_used; end if;
 v_activity_id:='FY2570-TR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.monitor_activities
  (id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_amount,0,p_allocated_on,2570,null);
 insert into public.monitor_reallocation_transfers
  (activity_id,project_code,project_name,activity_name,agency,allocated_on,amount,reference,note,created_by)
 values(v_activity_id,v_code,v_project,btrim(p_activity_name),left(coalesce(p_agency,''),180),
        p_allocated_on,p_amount,btrim(p_reference),left(coalesce(p_note,''),1000),p_actor)
 returning * into v_transfer;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'create',null,
        jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),p_actor);
 return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'activity_id',v_activity_id,
                          'project_code',v_code,'reserve_remaining',v_reserve.budget-v_used-p_amount);
end;
$$;
revoke all on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_allocate_reserve(text,text,text,text,date,numeric,text,text,uuid)
 to service_role;


-- Cancel an entire reserve-funded project and return its allocation without deleting history.
-- Cancellation is not allowed if any disbursement or PO was recorded for its activities.
create or replace function public.monitor_cancel_reserve_project(
 p_project_code text,p_cancelled_on date,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_code text;
 v_count integer;
 v_amount numeric(16,2);
 v_latest date;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินคงเหลือ'; end if;
 v_code:=upper(btrim(coalesce(p_project_code,'')));
 if v_code!~'^T[0-9]{2,3}$' or p_reason is null or length(btrim(p_reason))<8
 then raise exception 'รหัสโครงการหรือเหตุผลการยกเลิกไม่ถูกต้อง'; end if;
 select count(*),coalesce(sum(amount),0),max(allocated_on)
 into v_count,v_amount,v_latest
 from public.monitor_reallocation_transfers
 where project_code=v_code and cancelled_on is null;
 if v_count=0 then raise exception 'โครงการนี้ไม่มีรายการจัดสรรที่ยังใช้งานอยู่'; end if;
 if p_cancelled_on is null or p_cancelled_on<v_latest or p_cancelled_on>date '2027-09-30'
 then raise exception 'วันที่คืนเงินต้องไม่ก่อนวันที่จัดสรรและต้องอยู่ในปีงบประมาณ'; end if;
 if exists(
  select 1 from public.monitor_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(
  select 1 from public.monitor_po_entries e join public.monitor_activities a on a.id=e.activity_id
  where a.project_code=v_code
 ) or exists(select 1 from public.monitor_activities a where a.project_code=v_code
  and a.baseline_disbursed<>0)
 then raise exception 'โครงการมีรายการเบิกจ่ายหรือ PO แล้ว ไม่สามารถยกเลิกจัดสรรโดยตรง'; end if;
 update public.monitor_reallocation_transfers
 set cancelled_on=p_cancelled_on,
  cancelled_reason=left(btrim(p_reason),1000),
  cancelled_by=p_actor,cancelled_at=now()
 where project_code=v_code and cancelled_on is null;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'update',
 jsonb_build_object('entity','reserve-project','project_code',v_code,'allocated',v_amount),
 jsonb_build_object('entity','reserve-project-cancellation','project_code',v_code,
 'returned',v_amount,'date',p_cancelled_on,'reason',p_reason),p_actor);
 return jsonb_build_object('ok',true,'project_code',v_code,'returned',v_amount,
 'reserve_remaining',v_reserve.budget-(
 select coalesce(sum(amount),0) from public.monitor_reallocation_transfers
 where cancelled_on is null));
end;
$$;
revoke all on function public.monitor_cancel_reserve_project(text,date,text,uuid)
 from public,anon,authenticated;
grant execute on function public.monitor_cancel_reserve_project(text,date,text,uuid) to service_role;
