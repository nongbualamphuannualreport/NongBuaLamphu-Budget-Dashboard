import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,serverDb,verifyAdmin} from '@/lib/supabase';
export const dynamic='force-dynamic';
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function POST(req:NextRequest){
 const user=isConfigured()?await verifyAdmin(req.headers.get('authorization')):null;
 if(!user)return fail('กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่ที่มีสิทธิ์',403);
 let input:Record<string,unknown>;
 try{input=await req.json();}catch{return fail('ข้อมูล JSON ไม่ถูกต้อง');}
 const activity_id=typeof input.activity_id==='string'?input.activity_id:'';
 const po_on=typeof input.po_on==='string'?input.po_on:'';
 const amount=Number(input.amount);
 const kind=input.kind;
 const reference=String(input.reference??'').trim().slice(0,300);
 const note=String(input.note??'').trim().slice(0,1000);
 if(!activity_id||!/^\d{4}-\d{2}-\d{2}$/.test(po_on)||!['add','release','pay'].includes(String(kind))||
    !Number.isFinite(amount)||amount<=0||amount>999999999999.99||Math.abs(Math.round(amount*100)-amount*100)>.00001)
  return fail('วันที่หรือจำนวนเงิน PO ไม่ถูกต้อง');
 if(!reference&&!note)return fail('กรุณาระบุเลขที่สัญญาหรือเหตุผล/เอกสารอ้างอิง');
 const db=serverDb();
 const {data,error}=await db.rpc('monitor_apply_po',{
  p_activity_id:activity_id,p_date:po_on,p_amount:amount,p_kind:kind,
  p_reference:reference,p_note:note,p_actor:user.id
 });
 if(error)return fail(error.message,422);
 return NextResponse.json({ok:true,result:data},{headers:{'Cache-Control':'no-store'}});
}
