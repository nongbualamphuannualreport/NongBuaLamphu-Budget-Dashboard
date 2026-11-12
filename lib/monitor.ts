export type MonitorActivity = { id:string; project_code:string; project_name:string; name:string; agency:string; budget:number; baseline_disbursed:number; baseline_date:string; fiscal_year:number; source_row:number|null };
export type MonitorEntry = { id:string; activity_id:string; paid_on:string; amount:number; reference:string; note:string; created_at:string };
export type MonitorPeriod = 'daily'|'monthly'|'yearly';
export const fmt = (n:number) => new Intl.NumberFormat('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n);
export function fiscalBounds(year:number){return [`${year-544}-10-01`,`${year-543}-09-30`] as const;}
export function bounds(mode:MonitorPeriod,date:string){
  if(mode==='daily')return [date,date] as const;
  if(mode==='monthly') {const [y,m]=date.split('-').map(Number);return [`${y}-${String(m).padStart(2,'0')}-01`,new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)] as const;}
  return fiscalBounds(Number(date.slice(0,4))+(Number(date.slice(5,7))>=10?544:543));
}
export function reportRows(acts:MonitorActivity[],entries:MonitorEntry[],mode:MonitorPeriod,date:string){
  const [from,to]=bounds(mode,date);
  // The reference date, not the future end of the month/year, is the reporting cut-off.
   const asOf = date;
  const rows=acts.map(a=>{
    const tx=entries.filter(e=>e.activity_id===a.id);
    const opening=a.baseline_date<=asOf?a.baseline_disbursed:0;
    const cumulative=opening+tx.filter(e=>e.paid_on<=asOf).reduce((s,e)=>s+e.amount,0);
    const period=tx.filter(e=>e.paid_on>=from&&e.paid_on<=asOf).reduce((s,e)=>s+e.amount,0);
    return {...a,cumulative,period,remaining:a.budget-cumulative};
  });
  return {from,to,asOf,rows,total:{budget:rows.reduce((s,r)=>s+r.budget,0),disbursed:rows.reduce((s,r)=>s+r.cumulative,0),period:rows.reduce((s,r)=>s+r.period,0),remaining:rows.reduce((s,r)=>s+r.remaining,0)}};
}
export const validDate=(v:unknown):v is string=> {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
};
