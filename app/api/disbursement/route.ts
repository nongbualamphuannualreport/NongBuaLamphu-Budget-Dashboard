import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, publicDb } from '@/lib/supabase';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  if (!isConfigured()) return NextResponse.json({error:'ยังไม่ได้เชื่อม Supabase'}, {status:503});
  const cutoff=request.nextUrl.searchParams.get('date') ?? '9999-12-31';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) return NextResponse.json({error:'วันที่ไม่ถูกต้อง'}, {status:400});
  const {data,error}=await publicDb().from('disbursement_reports').select('report,as_of_date')
    .eq('published',true).lte('as_of_date',cutoff).order('as_of_date',{ascending:false}).limit(1).maybeSingle();
  if(error) return NextResponse.json({error:'ไม่สามารถอ่านรายงานได้'},{status:503});
  return NextResponse.json({report:data?.report ?? null}, {headers:{'Cache-Control':'no-store'}});
}
