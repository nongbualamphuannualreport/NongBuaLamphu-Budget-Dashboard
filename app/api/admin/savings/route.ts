import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,serverDb,verifyAdmin} from '@/lib/supabase';
import {validDate} from '@/lib/monitor';
export const dynamic='force-dynamic';
const fail=(error:string,status=400)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
 const user=isConfigured()?await verifyAdmin(req.headers.get('authorization')):null;
 if(!user)return fail('กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่ที่มีสิทธิ์',403);
 let input:Record<string,unknown>;
 try{input=await req.json();}catch{return fail('รูปแบบข้อมูลไม่ถูกต้อง');}
 const action=input.action,activity_id=typeof input.activity_id==='string'?input.activity_id:'';
 if(!activity_id||!['save','remove'].includes(String(action)))return fail('รายการหรือคำสั่งไม่ถูกต้อง');
 const removing=action==='remove';
 const amount=removing?null:Number(input.amount);
 const confirmed_on=removing?null:input.confirmed_on;
 const reference=removing?'':String(input.reference??'').trim().slice(0,300);
 const note=removing?'':String(input.note??'').trim().slice(0,1000);
 const reason=removing?String(input.reason??'').trim().slice(0,1000):'';
 if(removing&&reason.length<8)return fail('กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 8 ตัวอักษร');
 if(!removing&&(!validDate(confirmed_on)||!Number.isFinite(amount)||amount===null||amount<=0||!reference))return fail('กรุณากรอกยอดเงิน วันที่ยืนยัน และเลขที่เอกสารอ้างอิงให้ถูกต้อง');
 const db=serverDb();
 const {data,error}=await db.rpc('monitor_manage_project_saving',{
   p_action:action,p_activity_id:activity_id,p_amount:amount,
   p_confirmed_on:confirmed_on,p_reference:reference,p_note:note,
   p_reason:reason,p_actor:user.id
 });
 if(error)return fail(error.message,error.code==='23514'?422:400);
 return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
}
