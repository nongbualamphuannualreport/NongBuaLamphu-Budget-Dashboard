import 'server-only';
import {isConfigured,publicDb} from '@/lib/supabase';
import type {DisbursementReport} from '@/lib/disbursement';
import seed from '@/data/disbursement-latest.json';

export type PublicReportResult={report:DisbursementReport|null;preview:boolean};
export function requestedCutoff(input:string|null):string{
 const cutoff=input||'9999-12-31';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff))throw new Error('วันที่ที่เลือกไม่ถูกต้อง');
 if(cutoff!=='9999-12-31'){
  const d=new Date(cutoff+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==cutoff)throw new Error('วันที่ที่เลือกไม่ถูกต้อง');
 }
 return cutoff;
}
export async function getPublicReport(cutoff:string):Promise<PublicReportResult>{
 if(isConfigured()){
  try{
   const {data,error}=await publicDb().from('disbursement_reports').select('report,as_of_date').eq('published',true).lte('as_of_date',cutoff).order('as_of_date',{ascending:false}).limit(1).maybeSingle();
   if(!error&&data?.report)return {report:data.report as DisbursementReport,preview:false};
  }catch{ /* Retain the clearly-labelled reference data when the legacy public table is unavailable. */ }
 }
 return {report:cutoff>=seed.as_of_date?seed as DisbursementReport:null,preview:true};
}
