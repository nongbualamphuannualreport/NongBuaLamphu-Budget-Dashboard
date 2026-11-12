import type {DisbursementReport,DisbursementRow} from './disbursement';
import type {MonitorActivity,MonitorEntry} from './monitor';

const cents=(value:number)=>Math.round(value*100)/100;
const finite=(n:number)=>Number.isFinite(n)&&n>=0;
const dateOk=(x:string)=>/^\d{4}-\d{2}-\d{2}$/.test(x);
export function buildCurrentReport(activities:MonitorActivity[],entries:Pick<MonitorEntry,'activity_id'|'paid_on'|'amount'>[],asOf:string):DisbursementReport|null{
 if(!dateOk(asOf))throw Error('วันที่รายงานไม่ถูกต้อง');
 if(!activities.length)return null;
 const totals=new Map<string,number>();
 const seen=new Set<string>();
 for(const row of entries){
  if(!dateOk(row.paid_on)||!finite(Number(row.amount)))throw Error('พบรายการเบิกจ่ายที่ไม่ถูกต้อง');
  if(row.paid_on>asOf)continue;
  totals.set(row.activity_id,cents((totals.get(row.activity_id)??0)+Number(row.amount)));
 }
 const ps=new Map<string,DisbursementRow>();
 const details:DisbursementRow[]=[];
 const ordered=[...activities].sort((a,b)=>a.project_code.localeCompare(b.project_code)||Number(a.source_row??1e6)-Number(b.source_row??1e6)||a.id.localeCompare(b.id));
 for(const a of ordered){
  if(seen.has(a.id))throw Error('พบรหัสกิจกรรมซ้ำ');
  seen.add(a.id);
  const budget=Number(a.budget),baseline=Number(a.baseline_disbursed);
  if(!finite(budget)||!finite(baseline)||baseline>budget+.005)throw Error('วงเงินหรือยอดเบิกจ่ายตั้งต้นไม่ถูกต้อง: '+a.id);
  const paid=cents((a.baseline_date<=asOf?baseline:0)+(totals.get(a.id)??0));
  if(paid>budget+.005)throw Error('ยอดเบิกจ่ายเกินวงเงินกิจกรรม: '+a.id);
  const remaining=cents(budget-paid);
  if(a.project_code!=='RESERVE'){
   details.push({code:a.id,project_code:a.project_code,activity:a.name,agency:a.agency,budget,po:0,disbursed:paid,remaining,source_row:a.source_row??undefined} as DisbursementRow);
  }
  const p=ps.get(a.project_code)??{code:a.project_code,name:a.project_name,budget:0,po:0,disbursed:0,remaining:0};
  p.budget=cents(p.budget+budget);
  p.disbursed=cents(p.disbursed+paid);
  p.remaining=cents(p.remaining+remaining);
  ps.set(a.project_code,p);
 }
 for(const activityId of totals.keys())if(!seen.has(activityId))throw Error('พบรายการเบิกจ่ายที่ไม่พบกิจกรรม: '+activityId);
 const projects=[...ps.values()];
 const budget=cents(projects.reduce((sum,p)=>sum+p.budget,0));
 const disbursed=cents(projects.reduce((sum,p)=>sum+p.disbursed,0));
 const remaining=cents(projects.reduce((sum,p)=>sum+p.remaining,0));
 if(Math.abs(cents(budget-disbursed)-remaining)>.01)throw Error('งบประมาณและยอดคงเหลือไม่สัมพันธ์กัน');
 return {
  fiscal_year:2570,as_of_date:asOf,report_type:'disbursement',
  source_file:'ข้อมูลจากระบบบันทึกผลการเบิกจ่ายรายกิจกรรม',
  totals:{budget,po:0,disbursed,spent:disbursed,surplus:0,remaining},
  projects,activities:details
 };
}
