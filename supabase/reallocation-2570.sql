-- Reserve-funded projects for FY2570. This migration does not alter any existing budget amount.
-- A transfer is represented by an immutable ledger row; reserve's source budget
-- stays 672,700 in monitor_activities, and reports subtract dated allocations.
create table if not exists public.monitor_reallocation_transfers (
 id uuid primary key default gen_random_uuid(),
 activity_id text not null unique references public.monitor_activities(id),
 project_code text not null check(project_code ~ '^T[0-9]{2,3}$' or project_code='P11'),
 project_name text not null,
 activity_name text not null,
 agency text not null default '',
 allocated_on date not null,
 amount numeric(16,2) not null check(amount>0),
 reference text not null check(length(btrim(reference))>0),
 note text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
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
   if (v_code!~'^T[0-9]{2,3}$' and v_code<>'P11') or not exists(
    select 1 from public.monitor_reallocation_transfers where project_code=v_code
   ) then raise exception 'โครงการนี้ไม่ใช่โครงการที่สร้างจากเงินโอนเปลี่ยนแปลง'; end if;
   select project_name into v_project from public.monitor_activities
    where project_code=v_code limit 1;
   if v_project is null then raise exception 'ไม่พบโครงการเป้าหมาย'; end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.monitor_reallocation_transfers;
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

-- Reverse one incorrectly recorded allocation when it has no disbursement/PO.
-- Both the transfer and its activity are deleted in a single transaction;
-- audit details remain permanently available in monitor_entry_audit.
create or replace function public.monitor_reverse_reserve(
 p_transfer_id uuid,p_reason text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_reserve public.monitor_activities%rowtype;
 v_transfer public.monitor_reallocation_transfers%rowtype;
 v_count integer;
begin
 select * into v_reserve from public.monitor_activities
 where id='FY2570-RESERVE' and project_code='RESERVE' for update;
 if not found then raise exception 'ไม่พบกองเงินโอนเปลี่ยนแปลง'; end if;
 select * into v_transfer from public.monitor_reallocation_transfers
 where id=p_transfer_id for update;
 if not found then raise exception 'ไม่พบรายการจัดสรรที่ต้องการยกเลิก'; end if;
 if p_reason is null or length(btrim(p_reason))<8 then
  raise exception 'กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 8 ตัวอักษร'; end if;
 select count(*) into v_count from public.monitor_entries
  where activity_id=v_transfer.activity_id;
 if v_count>0 then raise exception 'โครงการนี้มีรายการเบิกจ่ายอยู่ ไม่สามารถยกเลิกการจัดสรรได้';end if;
 select count(*) into v_count from public.monitor_po_entries
  where activity_id=v_transfer.activity_id;
 if v_count>0 then raise exception 'โครงการนี้มี PO ผูกพันอยู่ ไม่สามารถยกเลิกการจัดสรรได้';end if;
 insert into public.monitor_entry_audit(entry_id,action,before_value,after_value,by_user)
 values(gen_random_uuid(),'delete',jsonb_build_object('entity','reserve-reallocation','record',to_jsonb(v_transfer)),
  jsonb_build_object('reason',p_reason),p_actor);
 delete from public.monitor_reallocation_transfers where id=v_transfer.id;
 delete from public.monitor_activities where id=v_transfer.activity_id;
 return jsonb_build_object('ok',true,'returned',v_transfer.amount,'transfer_id',v_transfer.id);
end;
$$;
revoke all on function public.monitor_reverse_reserve(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.monitor_reverse_reserve(uuid,text,uuid) to service_role;
