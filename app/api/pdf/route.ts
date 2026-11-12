import {NextRequest} from 'next/server';
import {jsPDF} from 'jspdf';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {getPublicReport,requestedCutoff} from '@/lib/public-report';
import type {DisbursementReport,DisbursementRow} from '@/lib/disbursement';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const fmt=(n:number)=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:2}).format(n||0);
const percent=(a:number,b:number)=>b>0?(a/b*100).toFixed(2):'0.00';
const thaiDate=(date:string)=>new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(date+'T12:00:00+07:00'));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const navy:[number,number,number]=[27,46,72],green:[number,number,number]=[27,112,82],muted:[number,number,number]=[103,122,132],cream:[number,number,number]=[248,240,231],orange:[number,number,number]=[194,119,70],border:[number,number,number]=[222,229,228];

async function buildPdf(report:DisbursementReport,preview:boolean,mode:'summary'|'full'):Promise<Blob>{
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 const [reg,bold]=await Promise.all([
  readFile(join(process.cwd(),'public/fonts/NotoSansThai-Regular.ttf')),
  readFile(join(process.cwd(),'public/fonts/NotoSansThai-Bold.ttf'))
 ]);
 doc.addFileToVFS('NotoThai-Regular.ttf',reg.toString('base64'));
 doc.addFileToVFS('NotoThai-Bold.ttf',bold.toString('base64'));
 doc.addFont('NotoThai-Regular.ttf','NotoThai','normal');
 doc.addFont('NotoThai-Bold.ttf','NotoThai','bold');
 const W=210,M=15,contentW=W-M*2;
 const text=(value:string,x:number,y:number,size=10,boldFont=false,color:[number,number,number]=navy)=>{
  doc.setFont('NotoThai',boldFont?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(value,x,y);
 };
 const right=(value:string,x:number,y:number,size=10,boldFont=false,color:[number,number,number]=navy)=>{
  doc.setFont('NotoThai',boldFont?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(value,x,y,{align:'right'});
 };
 const wrap=(value:string,width:number,size=10,boldFont=false):string[]=>{
  doc.setFont('NotoThai',boldFont?'bold':'normal');doc.setFontSize(size);
  return doc.splitTextToSize(value||'-',width) as string[];
 };
 const bg=()=>{doc.setFillColor(253,251,248);doc.rect(0,0,210,297,'F');};
 const line=(x1:number,y1:number,x2:number,y2:number)=>{doc.setDrawColor(...border);doc.setLineWidth(.25);doc.line(x1,y1,x2,y2);};
 const footer=(page:number)=>{
  line(M,284,W-M,284);
  text('จังหวัดหนองบัวลำภู · รายงานผลการเบิกจ่ายงบประมาณ พ.ศ. 2570',M,290,8,false,muted);
  right(`${thaiDate(today())}  |  ${page}`,W-M,290,8,false,muted);
 };
 const card=(x:number,y:number,w:number,label:string,value:string,tint=false)=>{
  doc.setFillColor(...(tint?cream:[255,255,255] as [number,number,number]));
  doc.setDrawColor(...border);doc.roundedRect(x,y,w,33,2.5,2.5,'FD');
  text(label,x+4,y+10,9,false,muted);
  text(value,x+4,y+22.5,16,true,tint?orange:navy);
  text('บาท',x+4,y+29,8,false,muted);
 };
 const detailHead=(title:string,subtitle:string)=>{
  bg();doc.setFillColor(...navy);doc.rect(0,0,210,29,'F');
  text(title,M,17,16,true,[255,255,255]);
  text(subtitle,M,38,9,false,muted);
  line(M,43,W-M,43);
 };
 bg();
 doc.setFillColor(...navy);doc.rect(0,0,210,78,'F');
 doc.setFillColor(...orange);doc.roundedRect(M,12,43,8,4,4,'F');
 text('รายงานงบประมาณจังหวัด',M+3,17.5,8.5,true,[255,255,255]);
 text('ผลการเบิกจ่ายงบประมาณ',M,33,20,true,[255,255,255]);
 text('จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570',M,43,12,true,[246,219,199]);
 text(fmt(report.totals.budget),M,61,25,true,[255,255,255]);
 text('บาท · วงเงินงบประมาณรวม',M+90,61,10,false,[230,233,237]);
 text('วันที่จัดทำรายงาน '+thaiDate(today()),M,87,10,true);
 right('ข้อมูลเบิกจ่าย ณ '+thaiDate(report.as_of_date),W-M,87,9,false,muted);
 if(preview){doc.setFillColor(...cream);doc.roundedRect(M,92,contentW,9,2,2,'F');text('ฉบับร่าง · ข้อมูลยังไม่ยืนยันเผยแพร่',M+3,98,9,true,orange);}
 const cy=preview?107:96;
 const col=(contentW-8)/3;
 card(M,cy,col,'ผลเบิกจ่ายสะสม',fmt(report.totals.disbursed));
 card(M+col+4,cy,col,'คงเหลือยังไม่เบิกจ่าย',fmt(report.totals.remaining));
 doc.setFillColor(...cream);doc.setDrawColor(...border);doc.roundedRect(M+2*(col+4),cy,col,33,2.5,2.5,'FD');
 text('อัตราการเบิกจ่าย',M+2*(col+4)+4,cy+10,9,false,muted);
 text(percent(report.totals.disbursed,report.totals.budget)+'%',M+2*(col+4)+4,cy+24,18,true,orange);
 const py=cy+46;
 text('ความก้าวหน้าการเบิกจ่าย',M,py,13,true);
 right(percent(report.totals.disbursed,report.totals.budget)+'%',W-M,py,13,true,orange);
 doc.setFillColor(229,232,231);doc.roundedRect(M,py+6,contentW,5,2.5,2.5,'F');
 const progress=Math.min(100,Math.max(0,report.totals.budget?report.totals.disbursed/report.totals.budget*100:0));
 if(progress>0){doc.setFillColor(...orange);doc.roundedRect(M,py+6,Math.max(1,contentW*progress/100),5,2.5,2.5,'F');}
 text('เบิกจ่ายแล้ว '+fmt(report.totals.disbursed)+' บาท',M,py+18,8,false,muted);
 right('คงเหลือ '+fmt(report.totals.remaining)+' บาท',W-M,py+18,8,false,muted);
 const projects=report.projects.filter(p=>p.code!=='RESERVE');
 const begun=projects.filter(p=>p.disbursed>0);
 const ystats=py+27;
 doc.setFillColor(236,241,246);doc.roundedRect(M,ystats,contentW,29,2.5,2.5,'F');
 text('สถานะรายโครงการ',M+4,ystats+10,10,true);
 const counts=[['โครงการทั้งหมด',projects.length],['เริ่มเบิกจ่ายแล้ว',begun.length],['ยังไม่เบิกจ่าย',projects.length-begun.length]];
 counts.forEach(([label,value],i)=>{const x=M+54+i*41;text(String(value),x,ystats+12,15,true,green);text(String(label),x,ystats+21,8,false,muted);});
 const yList=ystats+40;
 text('โครงการที่มีการเบิกจ่าย',M,yList,12,true);
 const first=begun.sort((a,b)=>b.disbursed-a.disbursed).slice(0,3);
 let yi=yList+10;
 for(const [index,p] of first.entries()){
  doc.setFillColor(247,239,232);doc.roundedRect(M,yi-5,8,8,1.5,1.5,'F');
  text(String(index+1).padStart(2,'0'),M+1.2,yi+.5,8,true,orange);
  const name=wrap(p.name??p.activity??'',118,9.2,true).slice(0,2);
  name.forEach((line,i)=>text(line,M+12,yi+i*5,9.2,true));
  right(fmt(p.disbursed)+' บาท',W-M,yi+1,9.5,true,navy);
  yi+=Math.max(13,name.length*5+6);
  line(M,yi-5,W-M,yi-5);
 }
 if(preview)text('ข้อมูลระหว่างตรวจสอบ ไม่ใช้เป็นรายงานรับรองอย่างเป็นทางการ',M,270,8.5,true,orange);
 footer(1);
 if(mode==='full'){
  let y=0;
  let page=1;
  const startPage=(title:string,subtitle:string)=>{doc.addPage('a4','portrait');page++;detailHead(title,subtitle);y=50;};
  const headerRow=(headers:string[],colX:number[])=>{
   doc.setFillColor(...navy);doc.rect(M,y-5,contentW,11,'F');
   headers.forEach((h,i)=>i===0?text(h,colX[i],y+2,8.5,true,[255,255,255]):right(h,colX[i],y+2,8.5,true,[255,255,255]));
   y+=11;
  };
  startPage('ผลการเบิกจ่ายรายโครงการ','จำแนกตามโครงการ · หน่วย : บาท');
  headerRow(['โครงการ','งบประมาณ','เบิกจ่าย','คงเหลือ'],[M+3,123,158,193]);
  for(const [index,p] of report.projects.entries()){
   const name=wrap(`${index+1}. ${p.name??p.activity??''}`,92,9.5,true);
   const h=Math.max(14,name.length*5.3+5);
   if(y+h>274){footer(page);startPage('ผลการเบิกจ่ายรายโครงการ (ต่อ)','จำแนกตามโครงการ · หน่วย : บาท');headerRow(['โครงการ','งบประมาณ','เบิกจ่าย','คงเหลือ'],[M+3,123,158,193]);}
   name.forEach((line,i)=>text(line,M+3,y+5.5+i*5.3,9.5,true));
   right(fmt(p.budget),123,y+6,8.6);
   right(fmt(p.disbursed),158,y+6,8.6,false,green);
   right(fmt(p.remaining),193,y+6,8.6);
   y+=h;line(M,y,W-M,y);
  }
  y+=10;doc.setFillColor(236,244,239);doc.roundedRect(M,y-5,contentW,15,2,2,'F');
  text('รวมทั้งสิ้น',M+3,y+4,10,true);
  right(fmt(report.totals.budget),123,y+4,9.5,true);
  right(fmt(report.totals.disbursed),158,y+4,9.5,true,green);
  right(fmt(report.totals.remaining),193,y+4,9.5,true);
  footer(page);
  startPage('ผลการเบิกจ่ายรายกิจกรรมย่อย','รายละเอียดกิจกรรมและหน่วยดำเนินการ · หน่วย : บาท');
  headerRow(['กิจกรรม / หน่วยดำเนินการ','งบประมาณ','เบิกจ่าย','คงเหลือ'],[M+3,123,158,193]);
  for(const p of report.activities){
   const label=(p.activity??p.name??'ไม่ระบุชื่อกิจกรรม');
   const names=wrap(label,92,9.2,true);
   const agencies=wrap(p.agency??'ไม่ระบุหน่วยดำเนินการ',92,8);
   const h=Math.max(19,names.length*4.9+agencies.length*4.3+7);
   if(y+h>274){footer(page);startPage('ผลการเบิกจ่ายรายกิจกรรมย่อย (ต่อ)','รายละเอียดกิจกรรมและหน่วยดำเนินการ · หน่วย : บาท');headerRow(['กิจกรรม / หน่วยดำเนินการ','งบประมาณ','เบิกจ่าย','คงเหลือ'],[M+3,123,158,193]);}
   names.forEach((v,i)=>text(v,M+3,y+4.7+i*4.9,9.2,true));
   agencies.forEach((v,i)=>text(v,M+3,y+4.7+names.length*4.9+i*4.3,8,false,muted));
   right(fmt(p.budget),123,y+5.5,8.5);
   right(fmt(p.disbursed),158,y+5.5,8.5,false,green);
   right(fmt(p.remaining),193,y+5.5,8.5);
   y+=h;line(M,y,W-M,y);
  }
  footer(page);
 }
 return doc.output('blob');
}
export async function GET(req:NextRequest){
 try{
  const cutoff=requestedCutoff(req.nextUrl.searchParams.get('date'));
  const rawMode=req.nextUrl.searchParams.get('mode');
  if(rawMode&&rawMode!=='summary'&&rawMode!=='full')return Response.json({error:'ประเภทเอกสารไม่ถูกต้อง'},{status:400});
  const mode=rawMode==='full'?'full':'summary';
  const {report,preview}=await getPublicReport(cutoff);
  if(!report)return Response.json({error:'ยังไม่มีรายงานในช่วงวันที่เลือก'},{status:404});
  const blob=await buildPdf(report,preview,mode);
  const attachment=req.nextUrl.searchParams.get('download')==='1';
  const file=`nongbualamphu-budget-${mode}-2570-${report.as_of_date}.pdf`;
  return new Response(blob,{headers:{
   'Content-Type':'application/pdf',
   'Content-Disposition':`${attachment?'attachment':'inline'}; filename="${file}"`,
   'Cache-Control':'private, no-store',
   'X-Content-Type-Options':'nosniff'
  }});
 }catch(err){return Response.json({error:err instanceof Error?err.message:'ไม่สามารถสร้าง PDF ได้'},{status:500});}
}
