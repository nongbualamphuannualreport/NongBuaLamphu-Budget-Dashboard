-- A deferred consistency check protects confirmed savings against later PO/payment edits.
-- Deferring to transaction commit permits PO payments that insert two balancing rows.
create or replace function public.monitor_guard_confirmed_savings()
returns trigger language plpgsql set search_path = '' as $function$
declare
  v_id text;
  v_budget numeric;
  v_opening numeric;
  v_date date;
  v_saving numeric;
  v_saving_on date;
  v_bad date;
begin
  v_id := case when TG_TABLE_NAME='monitor_activities' then coalesce(new.id,old.id)
    else coalesce(new.activity_id,old.activity_id) end;
  select s.amount,s.confirmed_on into v_saving,v_saving_on
  from public.monitor_project_savings s where s.activity_id=v_id;
  if not found then return null; end if;
  select a.budget,a.baseline_disbursed,a.baseline_date
    into v_budget,v_opening,v_date from public.monitor_activities a where a.id=v_id;
  if not found then return null; end if;
  with movements as (
    select e.paid_on as day, e.amount as paid, 0::numeric as po
      from public.monitor_entries e where e.activity_id=v_id
    union all
    select p.po_on as day,0::numeric as paid,p.amount as po
      from public.monitor_po_entries p where p.activity_id=v_id
    union all
    select v_saving_on,0::numeric,0::numeric
  ), daily as (
    select day,sum(paid) as paid,sum(po) as po
      from movements group by day
  ), running as (
    select day, v_opening+sum(paid) over(order by day) as paid,
      sum(po) over(order by day) as po
      from daily
  )
  select min(day) into v_bad from running
  where day>=v_saving_on and (paid<-.005 or po<-.005 or paid+po+v_saving>v_budget+.005);
  if v_bad is not null then
    raise exception 'รายการนี้จะทำให้ยอดผูกพันและเบิกจ่ายรวมกับเงินเหลือจ่ายที่ยืนยันแล้วเกินวงเงินกิจกรรม ณ วันที่ %', v_bad;
  end if;
  return null;
end;
$function$;
revoke all on function public.monitor_guard_confirmed_savings() from PUBLIC,anon,authenticated;
grant execute on function public.monitor_guard_confirmed_savings() to service_role;
drop trigger if exists monitor_savings_guard_on_payment on public.monitor_entries;
create constraint trigger monitor_savings_guard_on_payment
 after insert or update or delete on public.monitor_entries
 deferrable initially deferred for each row execute function public.monitor_guard_confirmed_savings();
drop trigger if exists monitor_savings_guard_on_po on public.monitor_po_entries;
create constraint trigger monitor_savings_guard_on_po
 after insert or update or delete on public.monitor_po_entries
 deferrable initially deferred for each row execute function public.monitor_guard_confirmed_savings();
drop trigger if exists monitor_savings_guard_on_saving on public.monitor_project_savings;
create constraint trigger monitor_savings_guard_on_saving
 after insert or update or delete on public.monitor_project_savings
 deferrable initially deferred for each row execute function public.monitor_guard_confirmed_savings();
drop trigger if exists monitor_savings_guard_on_budget on public.monitor_activities;
create constraint trigger monitor_savings_guard_on_budget
 after update on public.monitor_activities
 deferrable initially deferred for each row execute function public.monitor_guard_confirmed_savings();
