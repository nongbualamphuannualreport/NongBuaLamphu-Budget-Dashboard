import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,serverDb,verifyAdmin} from '@/lib/supabase';
import {validDate,validateNetLedger,type MonitorEntry,type MonitorActivity} from '@/lib/monitor';
import {validateCombinedLedger} from '@/lib/po';
import baseline from '@/data/monitor-baseline.json';
export const dynamic='force-dynamic';
async function authorize(req:NextRequest){return isConfigured()?verifyAdmin(req.headers.get('authorization')):null;}
const unauthorized=()=>NextResponse.json({error:'กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่ที่มีสิทธิ์'},{status:403});
const bad=(message:string,status=400)=>NextResponse.json({error:message},{status});
async function readAllEntries(db:ReturnType<typeof serverDb>){
  const rows:MonitorEntry[]=[];
  for(let offset=0;offset<20000;offset+=500){
    const {data,error}=await db.from('monitor_entries').select('*').order('paid_on',{ascending:false}).order('id',{ascending:true}).range(offset,offset+499);
    if(error)throw Error(error.message);
    rows.push(...((data??[]) as MonitorEntry[]));
    if((data??[]).length<500)return {rows,truncated:false};
  }
  return {rows,truncated:true};
}
// This interface is internal. It never uses the public anon key for reads/writes.
export async function GET(req:NextRequest){
  if(!await authorize(req))return unauthorized();
  const db=serverDb();
  try{
    const [a,e,poResult,transfersResult]=await Promise.all([
      db.from('monitor_activities').select('*').order('project_code').order('source_row'),
      readAllEntries(db),
      db.from('monitor_po_entries').select('*').order('po_on',{ascending:false}).order('id',{ascending:true}).limit(20001),
      db.from('monitor_reallocation_transfers').select('*').order('allocated_on',{ascending:false}).order('id',{ascending:true}).limit(1001)
    ]);
    if(a.error)return bad(a.error.message,500);
    if(poResult.error)return bad('อ่านข้อมูล PO ไม่สำเร็จ: '+poResult.error.message,500);
    if(transfersResult.error)return bad('อ่านข้อมูลเงินโอนเปลี่ยนแปลงไม่สำเร็จ: '+transfersResult.error.message,500);
    return NextResponse.json({activities:a.data??[],entries:e.rows,poEntries:poResult.data??[],transfers:transfersResult.data??[],truncated:e.truncated||((poResult.data??[]).length>20000)||((transfersResult.data??[]).length>1000)},{headers:{'Cache-Control':'no-store'}});
  }catch(err){return bad(err instanceof Error?err.message:'อ่านข้อมูลไม่สำเร็จ',500);}
}
export async function POST(req:NextRequest){
  const user=await authorize(req);if(!user)return unauthorized();
  const db=serverDb();let p:Record<string,unknown>;
  try{p=await req.json();}catch{return bad('ข้อมูล JSON ไม่ถูกต้อง');}
  if(p.action==='initialize'){
    const existing=await db.from('monitor_activities').select('id').limit(1);
    if(existing.error)return bad(existing.error.message,500);
    if(existing.data?.length)return bad('มีข้อมูลกิจกรรมอยู่แล้ว ระบบไม่อนุญาตให้นำเข้าข้อมูลตั้งต้นซ้ำ',409);
    // Original activity rows are leaves in the source workbook, so never sum project headers again.
    const projects=new Map((baseline.projects as {code:string;name:string}[]).map(x=>[x.code,x.name]));
    const rows=(baseline.activities as {source_row:number;project_code:string;activity:string;agency:string;budget:number;disbursed:number}[]).map(a=>({
      id:`FY2570-R${a.source_row}`,project_code:a.project_code,project_name:projects.get(a.project_code)||'',
      name:a.activity,agency:a.agency||'',budget:a.budget,baseline_disbursed:a.disbursed,
      baseline_date:'2026-11-10',fiscal_year:2570,source_row:a.source_row
    }));
    // Reserve is a separate budget category. It has no disbursement leaves.
    const reserve=(baseline.projects as {code:string;name:string;budget:number;disbursed:number}[]).find(x=>x.code==='RESERVE');
    if(reserve)rows.push({id:'FY2570-RESERVE',project_code:'RESERVE',project_name:reserve.name,name:reserve.name,agency:'',budget:reserve.budget,baseline_disbursed:reserve.disbursed,baseline_date:'2026-11-10',fiscal_year:2570,source_row:0});
    const {error}=await db.from('monitor_activities').insert(rows);
    if(error)return bad(error.message,500);
    return NextResponse.json({ok:true,count:rows.length});
  }
  if(p.action!=='save-entry'&&p.action!=='delete-entry')return bad('คำสั่งไม่ถูกต้อง');
  const id=typeof p.id==='string'?p.id:'';
  let prev:MonitorEntry|null=null;
  if(id){const q=await db.from('monitor_entries').select('*').eq('id',id).maybeSingle();if(q.error)return bad(q.error.message,500);prev=q.data;}
  if(p.action==='delete-entry'){
    if(!prev)return bad('ไม่พบรายการที่จะลบ',404);
    const activity=await db.from('monitor_activities').select('budget,baseline_disbursed,baseline_date').eq('id',prev.activity_id).maybeSingle();
    const all=await db.from('monitor_entries').select('id,paid_on,amount').eq('activity_id',prev.activity_id).limit(20001);
    if(activity.error||!activity.data||all.error)return bad('ไม่สามารถตรวจสอบยอดหลังลบได้',500);
    if((all.data??[]).length>20000)return bad('มีรายการมากเกินขอบเขตการตรวจสอบ',422);
    try{validateNetLedger(Number(activity.data.budget),Number(activity.data.baseline_disbursed),String(activity.data.baseline_date),
      (all.data??[]).filter(e=>e.id!==id).map(e=>({paid_on:String(e.paid_on),amount:Number(e.amount)})));
    }catch(err){return bad(err instanceof Error?err.message:'ยอดย้อนหลังจะผิดหลังลบ',422);}
    const poQuery=await db.from('monitor_po_entries').select('po_on,amount,related_payment_id').eq('activity_id',prev.activity_id).limit(20001);
    if(poQuery.error)return bad(poQuery.error.message,500);
    if((poQuery.data??[]).some(row=>row.related_payment_id===id))return bad('รายการนี้จ่ายจาก PO แล้ว ไม่อนุญาตให้ลบโดยตรง กรุณาติดต่อผู้ดูแลระบบเพื่อปรับปรุงตามหลักฐาน',422);
    try{validateCombinedLedger(Number(activity.data.budget),Number(activity.data.baseline_disbursed),String(activity.data.baseline_date),
      (all.data??[]).filter(e=>e.id!==id).map(e=>({paid_on:String(e.paid_on),amount:Number(e.amount)})),
      (poQuery.data??[]).map(e=>({po_on:String(e.po_on),amount:Number(e.amount)})));
    }catch(err){return bad(err instanceof Error?err.message:'ยอดผูกพัน PO ไม่ถูกต้องหลังลบ',422);}
    const d=await db.from('monitor_entries').delete().eq('id',id);if(d.error)return bad(d.error.message,500);
    await db.from('monitor_entry_audit').insert({entry_id:id,action:'delete',before_value:prev,by_user:user.id});
    return NextResponse.json({ok:true});
  }
  const activity_id=typeof p.activity_id==='string'?p.activity_id:'';
  const inputAmount=Number(p.amount),paid_on=p.paid_on;
  const kind=p.kind==='reduction'?'reduction':p.kind==='disbursement'||p.kind===undefined?'disbursement':null;
  if(!kind||!activity_id||!validDate(paid_on)||!Number.isFinite(inputAmount)||inputAmount<=0||Math.abs(Math.round(inputAmount*100)-inputAmount*100)>.00001)
    return bad('กิจกรรม วันที่ หรือจำนวนเงินไม่ถูกต้อง');
  if(kind==='reduction'&&!String(p.note??'').trim()&&!String(p.reference??'').trim())
    return bad('กรุณาระบุเหตุผลหรือเอกสารอ้างอิงในการลดยอดเบิกจ่าย');
  const amount=kind==='reduction'?-inputAmount:inputAmount;
  if(paid_on<'2026-11-10'||paid_on>'2027-09-30')return bad('วันที่ต้องอยู่ระหว่าง 10 พ.ย. 2569 ถึง 30 ก.ย. 2570');
  const a=await db.from('monitor_activities').select('*').eq('id',activity_id).maybeSingle();
  if(a.error||!a.data)return bad('ไม่พบกิจกรรมย่อย',404);
  const all=await db.from('monitor_entries').select('id,paid_on,amount').eq('activity_id',activity_id).limit(20001);
  if(all.error)return bad(all.error.message,500);
  if((all.data??[]).length>20000)return bad('รายการมากเกินขอบเขตการตรวจสอบ',422);
  try{
    validateNetLedger(Number(a.data.budget),Number(a.data.baseline_disbursed),String(a.data.baseline_date),
      [...(all.data??[]).filter(e=>e.id!==id).map(e=>({paid_on:String(e.paid_on),amount:Number(e.amount)})),{paid_on,amount}]);
  }catch(err){return bad(err instanceof Error?err.message:'ยอดสะสมไม่ถูกต้อง',422);}
  const poEntries=await db.from('monitor_po_entries').select('po_on,amount,related_payment_id').eq('activity_id',activity_id).limit(20001);
  if(poEntries.error)return bad('ตรวจสอบ PO ไม่สำเร็จ: '+poEntries.error.message,500);
  if((poEntries.data??[]).length>20000)return bad('ประวัติ PO เกินขอบเขตตรวจสอบ',422);
  if(prev&&(poEntries.data??[]).some(row=>row.related_payment_id===id))
    return bad('รายการจ่ายจาก PO แก้ไขตรงนี้ไม่ได้ กรุณาติดต่อผู้ดูแลระบบเพื่อปรับรายการตามหลักฐาน',422);
  try{
    validateCombinedLedger(Number(a.data.budget),Number(a.data.baseline_disbursed),String(a.data.baseline_date),
      [...(all.data??[]).filter(e=>e.id!==id).map(e=>({paid_on:String(e.paid_on),amount:Number(e.amount)})),{paid_on,amount}],
      (poEntries.data??[]).map(e=>({po_on:String(e.po_on),amount:Number(e.amount)})));
  }catch(err){return bad(err instanceof Error?err.message:'ยอด PO และเบิกจ่ายรวมกันเกินวงเงิน',422);}
  if(prev&&prev.activity_id!==activity_id){
    const oldActivity=await db.from('monitor_activities').select('budget,baseline_disbursed,baseline_date').eq('id',prev.activity_id).maybeSingle();
    const oldRows=await db.from('monitor_entries').select('id,paid_on,amount').eq('activity_id',prev.activity_id).limit(20001);
    const oldPo=await db.from('monitor_po_entries').select('po_on,amount').eq('activity_id',prev.activity_id).limit(20001);
    if(oldActivity.error||!oldActivity.data||oldRows.error||oldPo.error)return bad('ตรวจสอบกิจกรรมเดิมไม่ได้',500);
    if((oldRows.data??[]).length>20000)return bad('รายการเก่าเกินขอบเขตการตรวจสอบ',422);
    try{validateNetLedger(Number(oldActivity.data.budget),Number(oldActivity.data.baseline_disbursed),String(oldActivity.data.baseline_date),
      (oldRows.data??[]).filter(e=>e.id!==id).map(e=>({paid_on:String(e.paid_on),amount:Number(e.amount)})));
      validateCombinedLedger(Number(oldActivity.data.budget),Number(oldActivity.data.baseline_disbursed),String(oldActivity.data.baseline_date),
      (oldRows.data??[]).filter(e=>e.id!==id).map(e=>({paid_on:String(e.paid_on),amount:Number(e.amount)})),
      (oldPo.data??[]).map(e=>({po_on:String(e.po_on),amount:Number(e.amount)})));
    }catch(err){return bad(err instanceof Error?err.message:'ยอดกิจกรรมเดิมจะผิด',422);}
  }
  const record={activity_id,paid_on,amount,reference:String(p.reference??'').slice(0,300),note:String(p.note??'').slice(0,1000),updated_at:new Date().toISOString()};
  let result;
  if(prev){result=await db.from('monitor_entries').update(record).eq('id',id).select('*').single();}
  else{result=await db.from('monitor_entries').insert({...record,created_by:user.id}).select('*').single();}
  if(result.error){
    if(kind==='reduction'&&result.error.code==='23514')return bad('ฐานข้อมูลยังไม่เปิดใช้งานการลดยอดเบิกจ่าย กรุณารัน SQL migration ก่อน',422);
    return bad(result.error.message,500);
  }
  await db.from('monitor_entry_audit').insert({entry_id:result.data.id,action:prev?'update':'create',before_value:prev,after_value:result.data,by_user:user.id});
  return NextResponse.json({ok:true,entry:result.data});
}
