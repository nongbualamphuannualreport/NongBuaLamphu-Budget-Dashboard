import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,serverDb,verifyAdmin} from '@/lib/supabase';
import {validDate,type MonitorEntry,type MonitorActivity} from '@/lib/monitor';
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
    const [a,e]=await Promise.all([
      db.from('monitor_activities').select('*').order('project_code').order('source_row'),
      readAllEntries(db)
    ]);
    if(a.error)return bad(a.error.message,500);
    return NextResponse.json({activities:a.data??[],entries:e.rows,truncated:e.truncated},{headers:{'Cache-Control':'no-store'}});
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
    const d=await db.from('monitor_entries').delete().eq('id',id);if(d.error)return bad(d.error.message,500);
    await db.from('monitor_entry_audit').insert({entry_id:id,action:'delete',before_value:prev,by_user:user.id});
    return NextResponse.json({ok:true});
  }
  const activity_id=typeof p.activity_id==='string'?p.activity_id:'';
  const amount=Number(p.amount),paid_on=p.paid_on;
  if(!activity_id||!validDate(paid_on)||!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100)return bad('กิจกรรม วันที่ หรือจำนวนเงินไม่ถูกต้อง (ใช้เลขบวกและทศนิยมไม่เกิน 2 หลัก)');
  if(paid_on<'2026-11-10'||paid_on>'2027-09-30')return bad('วันที่ต้องอยู่ระหว่าง 10 พ.ย. 2569 ถึง 30 ก.ย. 2570');
  const a=await db.from('monitor_activities').select('*').eq('id',activity_id).maybeSingle();
  if(a.error||!a.data)return bad('ไม่พบกิจกรรมย่อย',404);
  const all=await db.from('monitor_entries').select('id,amount').eq('activity_id',activity_id);
  if(all.error)return bad(all.error.message,500);
  const total=Number(a.data.baseline_disbursed)+(all.data??[]).filter(e=>e.id!==id).reduce((s,e)=>s+Number(e.amount),0)+amount;
  if(total>Number(a.data.budget)+0.005)return bad('ยอดสะสมเบิกจ่ายเกินวงเงินกิจกรรม',422);
  const record={activity_id,paid_on,amount,reference:String(p.reference??'').slice(0,300),note:String(p.note??'').slice(0,1000),updated_at:new Date().toISOString()};
  let result;
  if(prev){result=await db.from('monitor_entries').update(record).eq('id',id).select('*').single();}
  else{result=await db.from('monitor_entries').insert({...record,created_by:user.id}).select('*').single();}
  if(result.error)return bad(result.error.message,500);
  await db.from('monitor_entry_audit').insert({entry_id:result.data.id,action:prev?'update':'create',before_value:prev,after_value:result.data,by_user:user.id});
  return NextResponse.json({ok:true,entry:result.data});
}
