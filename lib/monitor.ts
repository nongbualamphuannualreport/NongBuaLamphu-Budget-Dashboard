export type MonitorActivity = { id:string; project_code:string; project_name:string; name:string; agency:string; budget:number; baseline_disbursed:number; baseline_date:string; fiscal_year:number; source_row:number|null };
export type MonitorEntry = { id:string; activity_id:string; paid_on:string; amount:number; reference:string; note:string; created_at:string };
export type MonitorPeriod = 'daily'|'monthly'|'yearly';
import type {MonitorPoEntry} from './po';
export const fmt = (n:number) => new Intl.NumberFormat('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n);
export function fiscalBounds(year:number){return [`${year-544}-10-01`,`${year-543}-09-30`] as const;}
export function bounds(mode:MonitorPeriod,date:string){
  if(mode==='daily')return [date,date] as const;
  if(mode==='monthly') {const [y,m]=date.split('-').map(Number);return [`${y}-${String(m).padStart(2,'0')}-01`,new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)] as const;}
  return fiscalBounds(Number(date.slice(0,4))+(Number(date.slice(5,7))>=10?544:543));
}
export function reportRows(acts:MonitorActivity[],entries:MonitorEntry[],mode:MonitorPeriod,date:string,poEntries:MonitorPoEntry[]=[]){
  const [from,to]=bounds(mode,date);
  // The reference date, not the future end of the month/year, is the reporting cut-off.
   const asOf = date;
  const rows=acts.map(a=>{
    const tx=entries.filter(e=>e.activity_id===a.id);
    const opening=a.baseline_date<=asOf?a.baseline_disbursed:0;
    const cumulative=opening+tx.filter(e=>e.paid_on<=asOf).reduce((s,e)=>s+e.amount,0);
    const period=tx.filter(e=>e.paid_on>=from&&e.paid_on<=asOf).reduce((s,e)=>s+e.amount,0);
    const po=Math.round(poEntries.filter(p=>p.activity_id===a.id&&p.po_on<=asOf).reduce((s,e)=>s+Number(e.amount),0)*100)/100;
    return {...a,cumulative,period,po,available:a.budget-cumulative-po,remaining:a.budget-cumulative};
  });
  return {from,to,asOf,rows,total:{budget:rows.reduce((s,r)=>s+r.budget,0),disbursed:rows.reduce((s,r)=>s+r.cumulative,0),po:rows.reduce((s,r)=>s+r.po,0),available:rows.reduce((s,r)=>s+r.available,0),period:rows.reduce((s,r)=>s+r.period,0),remaining:rows.reduce((s,r)=>s+r.remaining,0)}};
}
export const validDate=(v:unknown):v is string=> {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
};

/** Verify the running net balance by date, not just its final value. */
export function validateNetLedger(budget:number,opening:number,openingDate:string,rows:Pick<MonitorEntry,'paid_on'|'amount'>[]){
 if(!Number.isFinite(budget)||!Number.isFinite(opening)||opening<0||opening>budget+.005)throw Error('ยอดตั้งต้นไม่ถูกต้อง');
 const byDate=new Map<string,number>();
 for(const r of rows){
  const amount=Number(r.amount);
  if(!validDate(r.paid_on)||r.paid_on<openingDate||!Number.isFinite(amount)||amount===0||Math.abs(Math.round(amount*100)-amount*100)>.00001)throw Error('วันที่หรือจำนวนเงินไม่ถูกต้อง');
  byDate.set(r.paid_on,Math.round(((byDate.get(r.paid_on)??0)+amount)*100)/100);
 }
 let balance=opening;
 for(const [date,change] of [...byDate].sort(([a],[b])=>a.localeCompare(b))){
  balance=Math.round((balance+change)*100)/100;
  if(balance<-.005)throw Error('ลดยอดเกินยอดเบิกจ่ายสะสม ณ วันที่ '+date);
  if(balance>budget+.005)throw Error('ยอดเบิกจ่ายสะสมเกินวงเงินกิจกรรม ณ วันที่ '+date);
 }
 return balance;
}
