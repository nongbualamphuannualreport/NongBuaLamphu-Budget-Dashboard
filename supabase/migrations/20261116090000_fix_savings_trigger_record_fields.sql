-- Repair trigger row lookup: savings uses activity_id, whereas activities uses id.
-- Never reference NEW on DELETE or OLD on INSERT.
CREATE OR REPLACE FUNCTION public.monitor_guard_confirmed_savings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
DECLARE
  v_id text;
  v_budget numeric;
  v_opening numeric;
  v_saving numeric;
  v_saving_on date;
  v_bad date;
BEGIN
  IF TG_TABLE_NAME='monitor_activities' THEN
    IF TG_OP='DELETE' THEN v_id:=OLD.id;
    ELSE v_id:=NEW.id; END IF;
  ELSE
    IF TG_OP='DELETE' THEN v_id:=OLD.activity_id;
    ELSE v_id:=NEW.activity_id; END IF;
  END IF;

  SELECT s.amount,s.confirmed_on INTO v_saving,v_saving_on
  FROM public.monitor_project_savings s
  WHERE s.activity_id=v_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT a.budget,a.baseline_disbursed INTO v_budget,v_opening
  FROM public.monitor_activities a WHERE a.id=v_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  WITH movements AS (
    SELECT e.paid_on AS day,e.amount AS paid,0::numeric AS po
    FROM public.monitor_entries e WHERE e.activity_id=v_id
    UNION ALL
    SELECT p.po_on AS day,0::numeric AS paid,p.amount AS po
    FROM public.monitor_po_entries p WHERE p.activity_id=v_id
    UNION ALL
    SELECT v_saving_on,0::numeric,0::numeric
  ),daily AS (
    SELECT day,sum(paid) AS paid,sum(po) AS po
    FROM movements GROUP BY day
  ),running AS (
    SELECT day,v_opening+sum(paid) OVER(ORDER BY day) AS paid,
      sum(po) OVER(ORDER BY day) AS po
    FROM daily
  )
  SELECT min(day) INTO v_bad FROM running
  WHERE day>=v_saving_on
    AND (paid<-.005 OR po<-.005 OR paid+po+v_saving>v_budget+.005);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้จะทำให้ยอดผูกพันและเบิกจ่ายรวมกับเงินเหลือจ่ายที่ยืนยันแล้วเกินวงเงินกิจกรรม ณ วันที่ %',v_bad;
  END IF;
  RETURN NULL;
END;
$function$;