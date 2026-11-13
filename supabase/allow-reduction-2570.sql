-- Run on the actual production Supabase project after taking a backup.
-- Existing data unchanged; negative monitor_entries.amount is a reduction.
begin;
do $$
declare item record;
begin
 for item in select c.conname from pg_constraint c
 where c.conrelid='public.monitor_entries'::regclass and c.contype='c'
 and pg_get_constraintdef(c.oid) ~ 'amount[[:space:]]*>[[:space:]]*0'
 loop
  execute format('alter table public.monitor_entries drop constraint %I',item.conname);
 end loop;
end $$;
alter table public.monitor_entries drop constraint if exists monitor_entries_amount_nonzero;
alter table public.monitor_entries add constraint monitor_entries_amount_nonzero check (amount <> 0);
commit;
