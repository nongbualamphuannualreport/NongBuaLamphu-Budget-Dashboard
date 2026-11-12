import {NextRequest,NextResponse} from 'next/server';
import {isConfigured,publicDb} from '@/lib/supabase';
import seed from '@/data/disbursement-latest.json';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const cutoff=req.nextUrl.searchParams.get('date')??'9999-12-31';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff))return NextResponse.json({error:'วันที่ไม่ถูกต้อง'},{status:400});
 try{
  if(isConfigured()){
   const {data,error}=await publicDb().from('disbursement_reports').select('report,as_of_date').eq('published',true).lte('as_of_date',cutoff).order('as_of_date',{ascending:false}).limit(1).maybeSingle();
   if(error)throw error;
   if(data?.report)return NextResponse.json({report:data.report,preview:false},{headers:{'Cache-Control':'no-store'}});
  }
 }catch{ // Still show clearly-labeled baseline if the legacy public reports table is not installed yet.
 return NextResponse.json({report:cutoff>=seed.as_of_date?seed:null,preview:true,databaseError:true},{headers:{'Cache-Control':'no-store'}});
}
 // A clearly marked reference baseline, never silently claim it is a published/verified record.
 return NextResponse.json({report:cutoff>=seed.as_of_date?seed:null,preview:true},{headers:{'Cache-Control':'no-store'}});
}
