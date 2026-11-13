import 'server-only';
import {isConfigured,serverDb} from '@/lib/supabase';
import type {DisbursementReport} from '@/lib/disbursement';
import type {MonitorActivity,MonitorEntry} from '@/lib/monitor';
import type {MonitorPoEntry} from '@/lib/po';
import {buildCurrentReport} from '@/lib/public-report-build';
import seed from '@/data/disbursement-latest.json';

export type PublicReportResult={report:DisbursementReport|null;preview:boolean};
const todayInBangkok=()=>{
 const parts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Bangkok'}).formatToParts(new Date());
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}`;
};
export function requestedCutoff(input:string|null):string{
 const cutoff=input||'9999-12-31';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff))throw new Error('วันที่ที่เลือกไม่ถูกต้อง');
 if(cutoff!=='9999-12-31'){
  const d=new Date(cutoff+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==cutoff)throw new Error('วันที่ที่เลือกไม่ถูกต้อง');
 }
 return cutoff;
}
async function readEntries(asOf:string):Promise<Pick<MonitorEntry,'activity_id'|'paid_on'|'amount'>[]>{
 const db=serverDb();
 const out:Pick<MonitorEntry,'activity_id'|'paid_on'|'amount'>[]=[];
 for(let offset=0;offset<20000;offset+=500){
  const {data,error}=await db.from('monitor_entries').select('activity_id,paid_on,amount').lte('paid_on',asOf)
   .order('paid_on',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw Error('อ่านรายการเบิกจ่ายไม่สำเร็จ: '+error.message);
  out.push(...(data??[]).map(x=>({activity_id:String(x.activity_id),paid_on:String(x.paid_on),amount:Number(x.amount)})));
  if((data??[]).length<500)return out;
 }
 throw Error('จำนวนรายการเบิกจ่ายเกินขอบเขตที่ระบบรองรับ กรุณาติดต่อผู้ดูแลระบบ');
}
async function readPoEntries(asOf:string):Promise<Pick<MonitorPoEntry,'activity_id'|'po_on'|'amount'>[]>{
 const db=serverDb();
 const out:Pick<MonitorPoEntry,'activity_id'|'po_on'|'amount'>[]=[];
 for(let offset=0;offset<20000;offset+=500){
  const {data,error}=await db.from('monitor_po_entries').select('activity_id,po_on,amount').lte('po_on',asOf)
   .order('po_on',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw Error('อ่านข้อมูล PO ไม่สำเร็จ: '+error.message);
  out.push(...(data??[]).map(x=>({activity_id:String(x.activity_id),po_on:String(x.po_on),amount:Number(x.amount)})));
  if((data??[]).length<500)return out;
 }
 throw Error('จำนวนรายการ PO เกินขอบเขตที่ระบบรองรับ');
}
function referenceReport(cutoff:string):PublicReportResult{
 return {report:cutoff>=seed.as_of_date?seed as DisbursementReport:null,preview:true};
}
export async function getPublicReport(cutoff:string):Promise<PublicReportResult>{
 const asOf=cutoff==='9999-12-31'?todayInBangkok():cutoff>todayInBangkok()?todayInBangkok():cutoff;
 if(!isConfigured())return referenceReport(asOf);
 const db=serverDb();
 const {data,error}=await db.from('monitor_activities').select('id,project_code,project_name,name,agency,budget,baseline_disbursed,baseline_date,fiscal_year,source_row')
  .eq('fiscal_year',2570).order('project_code',{ascending:true}).order('source_row',{ascending:true}).limit(1000);
 if(error){
  // On a new installation, the monitor tables may not have been created yet.
  if(error.code==='PGRST205'||error.code==='42P01')return referenceReport(asOf);
  throw Error('ไม่สามารถอ่านข้อมูลโครงการล่าสุดจากฐานข้อมูล');
 }
 if(!data?.length)return referenceReport(asOf);
 if(asOf<'2026-11-10')return {report:null,preview:false};
 const [entries,poEntries]=await Promise.all([readEntries(asOf),readPoEntries(asOf)]);
 const report=buildCurrentReport(data as MonitorActivity[],entries,asOf,poEntries);
 return {report,preview:false};
}
