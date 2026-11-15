import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,serverDb,verifyAdmin} from '@/lib/supabase';
import {validDate} from '@/lib/monitor';
export const dynamic='force-dynamic';
const fail=(error:string,status=400)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
const cents=(v:number)=>Math.round(v*100)/100;
export async function POST(req:NextRequest){
 const user=isConfigured()?await verifyAdmin(req.headers.get('authorization')):null;
 if(!user)return fail('กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่ที่มีสิทธิ์',403);
 let input:Record<string,unknown>;
 try{input=await req.json();}catch{return fail('ข้อมูลไม่ถูกต้อง');}
 const activityId=typeof input.activity_id==='string'?input.activity_id:'';
 const action=input.action;
 if(!activityId||!['save','remove'].includes(String(action)))return fail('รายการหรือคำสั่งไม่ถูกต้อง');
 const db=serverDb();
 const {data:activity,error:activityError}=await db.from('monitor_activities').select('id,project_code,budget,baseline_disbursed,baseline_date').eq('id',activityId).eq('fiscal_year',2570).maybeSingle();
 if(activityError)return fail('ตรวจสอบกิจกรรมไม่สำเร็จ',500);
 if(!activity||activity.project_code==='RESERVE')return fail('ไม่พบกิจกรรมที่สามารถบันทึกเงินเหลือจ่ายได้',404);
 const {data:previous,error:prevError}=await db.from('monitor_project_savings').select('*').eq('activity_id',activityId).maybeSingle();
 if(prevError)return fail('ไม่สามารถอ่านเงินเหลือจ่ายเดิมได้',500);
 if(action==='remove'){
   if(!previous)return fail('ไม่พบเงินเหลือจ่ายที่ต้องการลบ',404);
   const reason=String(input.reason??'').trim().slice(0,1000);
   if(reason.length<8)return fail('กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 8 ตัวอักษร');
   const audit=await db.from('monitor_project_savings_audit').insert({activity_id:activityId,action:'delete',before_value:previous,after_value:{reason},actor:user.id});
   if(audit.error)return fail('ไม่สามารถบันทึกประวัติการยกเลิกได้',500);
   const del=await db.from('monitor_project_savings').delete().eq('activity_id',activityId);
   if(del.error)return fail('ไม่สามารถยกเลิกรายการได้',500);
   return NextResponse.json({ok:true});
 }
 const amount=Number(input.amount),confirmed_on=input.confirmed_on,reference=String(input.reference??'').trim().slice(0,300),note=String(input.note??'').trim().slice(0,1000);
 if(!validDate(confirmed_on)||confirmed_on<'2026-11-10'||confirmed_on>'2027-09-30')return fail('วันที่ยืนยันเงินเหลือจ่ายไม่ถูกต้อง');
 if(!Number.isFinite(amount)||amount<=0||amount>999999999999.99||Math.abs(Math.round(amount*100)-amount*100)>.00001)return fail('จำนวนเงินไม่ถูกต้อง');
 if(!reference)return fail('กรุณาระบุเลขที่เอกสารยืนยันเงินเหลือจ่าย');
 if(confirmed_on<String(activity.baseline_date))return fail('วันที่ยืนยันต้องไม่ก่อนวันที่เริ่มบันทึกข้อมูลกิจกรรม');
 const [entries,po]=await Promise.all([
   db.from('monitor_entries').select('amount,paid_on').eq('activity_id',activityId).limit(20001),
   db.from('monitor_po_entries').select('amount,po_on').eq('activity_id',activityId).limit(20001)
 ]);
 if(entries.error||po.error||((entries.data??[]).length>20000)||((po.data??[]).length>20000))return fail('ไม่สามารถตรวจสอบยอดเบิกจ่ายและ PO ได้ครบ',500);
 const paid=cents(Number(activity.baseline_disbursed)+(entries.data??[]).reduce((n,e)=>n+Number(e.amount),0));
 const pendingPo=cents((po.data??[]).reduce((n,e)=>n+Number(e.amount),0));
 const available=cents(Number(activity.budget)-paid-pendingPo);
 if(amount>available+.005)return fail('ยอดเงินเหลือจ่ายที่ยืนยันต้องไม่เกินเงินที่ยังไม่เบิกจ่ายและไม่ติด PO ('+available.toLocaleString('th-TH')+' บาท)',422);
 const row={activity_id:activityId,amount:cents(amount),confirmed_on,reference,note,updated_by:user.id,updated_at:new Date().toISOString()};
 const audit=await db.from('monitor_project_savings_audit').insert({activity_id:activityId,action:previous?'update':'create',before_value:previous??null,after_value:row,actor:user.id});
 if(audit.error)return fail('ไม่สามารถบันทึกประวัติการแก้ไขได้',500);
 const {data,error}=await db.from('monitor_project_savings').upsert(row,{onConflict:'activity_id'}).select('*').single();
 if(error)return fail('ไม่สามารถบันทึกเงินเหลือจ่ายได้',500);
 return NextResponse.json({ok:true,saving:data},{headers:{'Cache-Control':'no-store'}});
}
