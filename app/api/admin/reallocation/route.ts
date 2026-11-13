import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,serverDb,verifyAdmin} from '@/lib/supabase';
export const dynamic='force-dynamic';
const failure=(error:string,status=400)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T00:00:00Z').getTime())&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export async function POST(req:NextRequest){
 const user=isConfigured()?await verifyAdmin(req.headers.get('authorization')):null;
 if(!user)return failure('กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่ที่มีสิทธิ์',403);
 let input:Record<string,unknown>;
 try{input=await req.json();}catch{return failure('ข้อมูลที่ส่งมาไม่ถูกต้อง');}
 const kind=input.action;
 const date=String(kind==='cancel'?input.cancelled_on:input.allocated_on??'');
 const amount=Number(input.amount);
 const reason=String(input.reason??'').trim();
 if(!validDate(date))return failure('วันที่ไม่ถูกต้อง');
 const db=serverDb();
 if(kind==='cancel'){
  const projectCode=String(input.project_code??'').trim();
  if((!/^T[0-9]{2,3}$/.test(projectCode)&&projectCode!=='P11')||reason.length<8)return failure('กรุณาระบุโครงการและเหตุผลการยกเลิกอย่างน้อย 8 ตัวอักษร');
  const {data,error}=await db.rpc('monitor_cancel_reserve_project',{
    p_project_code:projectCode,p_cancelled_on:date,p_reason:reason,p_actor:user.id
  });
  if(error)return failure(error.message,422);
  return NextResponse.json({ok:true,result:data},{headers:{'Cache-Control':'no-store'}});
 }
 if(kind!=='allocate')return failure('ไม่รู้จักคำสั่ง');
 if(!Number.isFinite(amount)||amount<=0||Math.abs(Math.round(amount*100)-amount*100)>0.00001)return failure('วงเงินไม่ถูกต้อง');
 const target=String(input.project_code??'').trim();
 const name=String(input.project_name??'').trim();
 const activity=String(input.activity_name??'').trim();
 const agency=String(input.agency??'').trim();
 const reference=String(input.reference??'').trim();
 const note=String(input.note??'').trim();
 if(!activity||activity.length>500||!reference||reference.length>300||name.length>350||agency.length>180||note.length>1000)
   return failure('กรุณาระบุชื่อกิจกรรมและเอกสารอนุมัติให้ครบถ้วน');
 if(!target&&!name)return failure('กรุณาระบุชื่อโครงการใหม่');
 if(target&&!/^T[0-9]{2,3}$/.test(target)&&target!=='P11')return failure('เลือกได้เฉพาะโครงการที่สร้างจากเงินโอน');
 const {data,error}=await db.rpc('monitor_allocate_reserve',{
  p_project_code:target,p_project_name:name,p_activity_name:activity,p_agency:agency,
  p_allocated_on:date,p_amount:amount,p_reference:reference,p_note:note,p_actor:user.id
 });
 if(error)return failure(error.message,422);
 return NextResponse.json({ok:true,result:data},{headers:{'Cache-Control':'no-store'}});
}
