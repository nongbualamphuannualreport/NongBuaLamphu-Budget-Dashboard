import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, serverDb, verifyAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const bad = (error:string,status=400) => NextResponse.json({error},{status});
const requireText=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
const money=(v:unknown)=> {
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)&&n>=0&&Math.abs(Math.round(n*100)-n*100)<0.00001?Math.round(n*100)/100:null;
};
const AUDIT='monitor_entry_audit';

async function payments(db:ReturnType<typeof serverDb>,activityId:string){
  let total=0;
  for(let offset=0;offset<20000;offset+=500){
    const {data,error}=await db.from('monitor_entries').select('amount').eq('activity_id',activityId).range(offset,offset+499);
    if(error)throw Error(error.message);
    for(const row of data??[])total+=Number(row.amount);
    if((data??[]).length<500)return total;
  }
  throw Error('รายการเบิกจ่ายจำนวนมากเกินขอบเขตการตรวจสอบ ไม่สามารถแก้วงเงินได้อย่างปลอดภัย');
}
async function audit(db:ReturnType<typeof serverDb>,action:'create'|'update'|'delete',before:unknown,after:unknown,userId:string){
  // Existing audit table stores both transaction and master-data changes, tagged by entity.
  const {error}=await db.from(AUDIT).insert({
    entry_id:crypto.randomUUID(),action,by_user:userId,
    before_value:before?{entity:'master-data',record:before}:null,
    after_value:after?{entity:'master-data',record:after}:null,
  });
  return error?'ดำเนินการสำเร็จ แต่บันทึกประวัติการแก้ไขไม่สำเร็จ: '+error.message:null;
}
export async function POST(req:NextRequest){
  const user=isConfigured()?await verifyAdmin(req.headers.get('authorization')):null;
  if(!user)return bad('กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่ที่มีสิทธิ์',403);
  let p:Record<string,unknown>;
  try{p=await req.json();}catch{return bad('รูปแบบข้อมูลไม่ถูกต้อง');}
  const action=p.action;
  const db=serverDb();
  try{
    if(action==='create-activity'){
      const project_code=requireText(p.project_code,20).toUpperCase();
      const project_name=requireText(p.project_name,350);
      const name=requireText(p.name,500);
      const agency=requireText(p.agency,180);
      const budget=money(p.budget);
      if(!/^P\d{2,3}$/.test(project_code)||!name||budget===null)return bad('กรุณาระบุรหัสโครงการ ชื่อกิจกรรม และงบประมาณที่ถูกต้อง');
      const {data:projectRows,error:projectError}=await db.from('monitor_activities').select('project_name').eq('project_code',project_code).limit(1);
      if(projectError)return bad(projectError.message,500);
      const actualProjectName=projectRows?.[0]?.project_name||project_name;
      if(!actualProjectName)return bad('กรุณาระบุชื่อโครงการใหม่');
      const row={
        id:'FY2570-C'+crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase(),
        project_code,project_name:actualProjectName,name,agency,budget,
        baseline_disbursed:0,baseline_date:'2026-11-10',fiscal_year:2570,source_row:null,
      };
      const {data,error}=await db.from('monitor_activities').insert(row).select('*').single();
      if(error)return bad(error.message,500);
      const warning=await audit(db,'create',null,data,user.id);
      return NextResponse.json({ok:true,activity:data,warning});
    }
    if(action==='update-activity'){
      const id=requireText(p.id,100);
      if(!id)return bad('กรุณาระบุกิจกรรมที่จะแก้ไข');
      const {data:original,error:readError}=await db.from('monitor_activities').select('*').eq('id',id).maybeSingle();
      if(readError)return bad(readError.message,500);
      if(!original)return bad('ไม่พบกิจกรรมนี้',404);
      if(original.project_code==='RESERVE')return bad('เงินคงเหลือจากการโอนเปลี่ยนแปลงเป็นหมวดคงที่ ไม่อนุญาตให้แก้ผ่านหน้ากิจกรรม',422);
      const name=requireText(p.name,500),agency=requireText(p.agency,180),budget=money(p.budget);
      if(!name||budget===null)return bad('กรุณากรอกชื่อกิจกรรมและวงเงินงบประมาณที่ถูกต้อง');
      const paid=Number(original.baseline_disbursed)+await payments(db,id);
      if(budget+0.005<paid)return bad('วงเงินใหม่ต่ำกว่ายอดเบิกจ่ายสะสม '+paid.toLocaleString('th-TH')+' บาท',422);
      const {data,error}=await db.from('monitor_activities').update({name,agency,budget}).eq('id',id).select('*').single();
      if(error)return bad(error.message,500);
      const warning=await audit(db,'update',original,data,user.id);
      return NextResponse.json({ok:true,activity:data,warning});
    }
    if(action==='delete-activity'){
      const id=requireText(p.id,100);
      if(!id)return bad('กรุณาระบุกิจกรรมที่ต้องการลบ');
      const {data:original,error:readError}=await db.from('monitor_activities').select('*').eq('id',id).maybeSingle();
      if(readError)return bad(readError.message,500);
      if(!original)return bad('ไม่พบกิจกรรมนี้',404);
      if(original.project_code==='RESERVE')return bad('ไม่อนุญาตให้ลบหมวดเงินคงเหลือจากการโอนเปลี่ยนแปลง',422);
      const {count,error:countError}=await db.from('monitor_entries').select('id',{count:'exact',head:true}).eq('activity_id',id);
      if(countError)return bad(countError.message,500);
      if(Number(original.baseline_disbursed)>0||(count??0)>0)return bad('กิจกรรมนี้มียอดตั้งต้นหรือประวัติการเบิกจ่ายแล้ว จึงไม่อนุญาตให้ลบ กรุณาแก้ไขข้อมูลแทน',422);
      const {error}=await db.from('monitor_activities').delete().eq('id',id);
      if(error)return bad(error.message,500);
      const warning=await audit(db,'delete',original,null,user.id);
      return NextResponse.json({ok:true,warning});
    }
    if(action==='rename-project'){
      const code=requireText(p.project_code,20).toUpperCase(),name=requireText(p.project_name,350);
      if(!/^P\d{2,3}$/.test(code)||!name)return bad('กรุณาระบุรหัสโครงการและชื่อโครงการใหม่ให้ครบ');
      const {data:before,error:readError}=await db.from('monitor_activities').select('id,project_code,project_name').eq('project_code',code);
      if(readError)return bad(readError.message,500);
      if(!before?.length)return bad('ไม่พบโครงการ',404);
      const {data,error}=await db.from('monitor_activities').update({project_name:name}).eq('project_code',code).select('id,project_code,project_name');
      if(error)return bad(error.message,500);
      const warning=await audit(db,'update',{project_code:code,rows:before},{project_code:code,rows:data},user.id);
      return NextResponse.json({ok:true,count:data?.length??0,warning});
    }
    return bad('คำสั่งไม่ถูกต้อง');
  }catch(e){return bad(e instanceof Error?e.message:'แก้ไขข้อมูลไม่สำเร็จ',500);}
}
