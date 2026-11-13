import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,serverDb,verifyAdmin} from '@/lib/supabase';
import {effectiveActivities,reserveSummary} from '@/lib/reallocation';
import type {MonitorActivity} from '@/lib/monitor';
export const dynamic='force-dynamic';
const fail=(message:string,status=400)=>NextResponse.json({error:message},{status});
async function authorized(req:NextRequest){return isConfigured()?verifyAdmin(req.headers.get('authorization')):null;}
export async function GET(req:NextRequest){
 const user=await authorized(req);
 if(!user)return fail('เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบ',403);
 const db=serverDb();
 const [activities,transfers]=await Promise.all([
  db.from('monitor_activities').select('*').eq('fiscal_year',2570).order('project_code'),
  db.from('monitor_reallocation_transfers').select('*').order('allocated_on',{ascending:false}).order('created_at',{ascending:false})
 ]);
 if(activities.error||transfers.error)return fail('อ่านข้อมูลเงินโอนเปลี่ยนแปลงไม่ได้',500);
 const acts=(activities.data??[]) as MonitorActivity[];
 const rows=transfers.data??[];
 const summary=reserveSummary(acts,rows,'9999-12-31');
 return NextResponse.json({summary,transfers:rows,projects:[...new Map(rows.map(x=>[x.project_code,{code:x.project_code,name:x.project_name}])).values()]},
 {headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const user=await authorized(req);
 if(!user)return fail('เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบ',403);
 let data:Record<string,unknown>;
 try{data=await req.json();}catch{return fail('ข้อมูลไม่ถูกต้อง');}
 const db=serverDb();
 if(data.action==='reverse'){
  const id=typeof data.id==='string'?data.id:'';
  const reason=typeof data.reason==='string'?data.reason.trim():'';
  if(!/^[0-9a-f-]{36}$/i.test(id)||reason.length<8)return fail('กรุณาระบุรายการและเหตุผลอย่างน้อย 8 ตัวอักษร');
  const result=await db.rpc('monitor_reverse_reserve',{p_transfer_id:id,p_reason:reason,p_actor:user.id});
  if(result.error)return fail(result.error.message,422);
  return NextResponse.json({ok:true,result:result.data});
 }
 if(data.action!=='allocate')return fail('ไม่รู้จักการทำงานนี้');
 const amount=Number(data.amount);
 const allocated_on=typeof data.allocated_on==='string'?data.allocated_on:'';
 const reference=typeof data.reference==='string'?data.reference.trim():'';
 const project_code=typeof data.project_code==='string'?data.project_code.trim():'';
 const project_name=typeof data.project_name==='string'?data.project_name.trim():'';
 const activity_name=typeof data.activity_name==='string'?data.activity_name.trim():'';
 const agency=typeof data.agency==='string'?data.agency.trim():'';
 const note=typeof data.note==='string'?data.note.trim():'';
 if(!Number.isFinite(amount)||amount<=0||Math.abs(Math.round(amount*100)-amount*100)>.00001||
 !/^\d{4}-\d{2}-\d{2}$/.test(allocated_on)||!activity_name||(!project_code&&!project_name)||!reference)
 return fail('กรุณาระบุชื่อโครงการ กิจกรรม วันที่ วงเงิน และเอกสารอ้างอิง');
 const result=await db.rpc('monitor_allocate_reserve',{
  p_project_code:project_code,p_project_name:project_name,p_activity_name:activity_name,
  p_agency:agency,p_allocated_on:allocated_on,p_amount:amount,
  p_reference:reference,p_note:note,p_actor:user.id
 });
 if(result.error)return fail(result.error.message,422);
 return NextResponse.json({ok:true,result:result.data});
}
