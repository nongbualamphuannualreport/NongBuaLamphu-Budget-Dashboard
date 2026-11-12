import {NextRequest,NextResponse} from 'next/server';
import {getPublicReport,requestedCutoff} from '@/lib/public-report';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const cutoff=requestedCutoff(req.nextUrl.searchParams.get('date'));
  const result=await getPublicReport(cutoff);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store, max-age=0'}});
 }catch(err){
  return NextResponse.json({error:err instanceof Error?err.message:'ไม่สามารถโหลดข้อมูลผลการเบิกจ่ายได้'},{status:500,headers:{'Cache-Control':'no-store'}});
 }
}
