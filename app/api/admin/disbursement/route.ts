import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, serverDb, verifyAdmin } from '@/lib/supabase';
import { validateDisbursement } from '@/lib/disbursement';
export const dynamic='force-dynamic';
async function authorized(req: NextRequest){
  if(!isConfigured()) return null;
  return verifyAdmin(req.headers.get('authorization'));
}
export async function GET(req:NextRequest){
  const user=await authorized(req);
  if(!user) return NextResponse.json({error:'ไม่ได้รับอนุญาต'},{status:403});
  if(req.nextUrl.searchParams.get('mode')==='list') {
    const {data,error}=await serverDb().from('disbursement_reports')
      .select('as_of_date,published,updated_at').order('as_of_date',{ascending:false}).limit(100);
    if(error)return NextResponse.json({error:'ไม่สามารถอ่านประวัติรายงานได้: '+error.message},{status:500});
    return NextResponse.json({items:data??[]},{headers:{'Cache-Control':'no-store'}});
  }
  const date=req.nextUrl.searchParams.get('date');
  if(date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({error:'วันที่ไม่ถูกต้อง'},{status:400});
  let query=serverDb().from('disbursement_reports').select('report,published,as_of_date');
  if(date)query=query.eq('as_of_date',date);
  else query=query.order('as_of_date',{ascending:false}).limit(1);
  const {data,error}=await query.maybeSingle();
  if(error) return NextResponse.json({error:'อ่านข้อมูลไม่สำเร็จ'},{status:500});
  return NextResponse.json({report:data?.report??null,published:data?.published??false,date:data?.as_of_date??null},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
  const user=await authorized(req);
  if(!user) return NextResponse.json({error:'ไม่ได้รับอนุญาต'},{status:403});
  let body:unknown;
  try{body=await req.json();}catch{return NextResponse.json({error:'JSON ไม่ถูกต้อง'},{status:400});}
  const payload=body as {report?:unknown;published?:unknown};
  const {report,errors}=validateDisbursement(payload?.report);
  if(!report) return NextResponse.json({error:'ไม่ผ่านการตรวจสอบ',errors},{status:422});
  if(typeof payload.published !== 'boolean') return NextResponse.json({error:'สถานะเผยแพร่ไม่ถูกต้อง'},{status:400});
  const {error}=await serverDb().from('disbursement_reports').upsert({
    as_of_date:report.as_of_date,report,published:payload.published,updated_by:user.id,updated_at:new Date().toISOString()
  },{onConflict:'as_of_date'});
  if(error) return NextResponse.json({error:'บันทึกไม่สำเร็จ: '+error.message},{status:500});
  return NextResponse.json({ok:true,published:payload.published,date:report.as_of_date});
}
