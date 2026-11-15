-- Atomic savings write with audit. Callable only by the server-side service role.
create or replace function public.monitor_manage_project_saving(
 p_action text,p_activity_id text,p_amount numeric,p_confirmed_on date,
 p_reference text,p_note text,p_reason text,p_actor uuid
) returns jsonb language plpgsql set search_path='' as $function$
declare
 v_act public.monitor_activities%rowtype;
 v_old jsonb;
 v_new jsonb;
 v_paid numeric;
 v_po numeric;
 v_available numeric;
begin
 select * into v_act from public.monitor_activities where id=p_activity_id and fiscal_year=2570 for update;
 if not found or v_act.project_code='RESERVE' then raise exception 'ไม่พบกิจกรรมที่สามารถบันทึกเงินเหลือจ่ายได้'; end if;
 select to_jsonb(s) into v_old from public.monitor_project_savings s where s.activity_id=p_activity_id for update;
 if p_action='remove' then
   if v_old is null then raise exception 'ไม่พบรายการเงินเหลือจ่าย'; end if;
   if length(btrim(coalesce(p_reason,'')))<8 then raise exception 'กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 8 ตัวอักษร'; end if;
   delete from public.monitor_project_savings where activity_id=p_activity_id;
   insert into public.monitor_project_savings_audit(activity_id,action,before_value,after_value,actor)
   values(p_activity_id,'delete',v_old,jsonb_build_object('reason',left(btrim(p_reason),1000)),p_actor);
   return jsonb_build_object('ok',true,'action','removed');
 elsif p_action<>'save' then raise exception 'คำสั่งไม่ถูกต้อง';
 end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>999999999999.99
 then raise exception 'จำนวนเงินเหลือจ่ายไม่ถูกต้อง'; end if;
 if p_confirmed_on is null or p_confirmed_on<v_act.baseline_date or
    p_confirmed_on<date '2026-11-10' or p_confirmed_on>date '2027-09-30'
 then raise exception 'วันที่ยืนยันเงินเหลือจ่ายไม่ถูกต้อง'; end if;
 if length(btrim(coalesce(p_reference,'')))=0 then raise exception 'กรุณาระบุเลขที่เอกสารยืนยันเงินเหลือจ่าย'; end if;
 select v_act.baseline_disbursed + coalesce(sum(amount),0) into v_paid
 from public.monitor_entries where activity_id=p_activity_id;
 select coalesce(sum(amount),0) into v_po from public.monitor_po_entries where activity_id=p_activity_id;
 v_available:=round(v_act.budget-v_paid-v_po,2);
 if p_amount>v_available+.005 then raise exception 'เงินเหลือจ่ายต้องไม่เกินวงเงินที่ยังไม่เบิกจ่ายและไม่ติด PO (% บาท)',v_available; end if;
 insert into public.monitor_project_savings(activity_id,amount,confirmed_on,reference,note,updated_by,updated_at)
 values(p_activity_id,round(p_amount,2),p_confirmed_on,left(btrim(p_reference),300),left(coalesce(p_note,''),1000),p_actor,now())
 on conflict(activity_id) do update set
 amount=excluded.amount,confirmed_on=excluded.confirmed_on,reference=excluded.reference,
 note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 select to_jsonb(s) into v_new from public.monitor_project_savings s where s.activity_id=p_activity_id;
 insert into public.monitor_project_savings_audit(activity_id,action,before_value,after_value,actor)
 values(p_activity_id,case when v_old is null then 'create' else 'update' end,v_old,v_new,p_actor);
 return jsonb_build_object('ok',true,'saving',v_new);
end;
$function$;
revoke all on function public.monitor_manage_project_saving(text,text,numeric,date,text,text,text,uuid) from PUBLIC,anon,authenticated;
grant execute on function public.monitor_manage_project_saving(text,text,numeric,date,text,text,text,uuid) to service_role;
