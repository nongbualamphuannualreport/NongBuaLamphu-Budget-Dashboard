'use client';
import {FileSpreadsheet} from 'lucide-react';
import {coreProject} from '@/lib/reallocation';

type Row={
  project_code:string;project_name:string;name:string;agency:string;
  budget:number;po:number;cumulative:number;period:number;remaining:number;
};
type Report={asOf:string;rows:Row[]};
type Kind='core'|'additional'|'activity';
const categories:{kind:Kind;label:string;filename:string}[]=[
  {kind:'core',label:'ดาวน์โหลด 10 โครงการหลัก CSV',filename:'core-projects'},
  {kind:'additional',label:'ดาวน์โหลดโครงการเพิ่มเติม CSV',filename:'additional-projects'},
  {kind:'activity',label:'ดาวน์โหลดกิจกรรมย่อย CSV',filename:'activities'}
];
function cell(v:unknown){
 const text=String(v??'');
 const protectedValue=/^[\s]*[=+@\-\t\r]/.test(text)?"'"+text:text;
 return '"'+protectedValue.replace(/"/g,'""')+'"';
}
export function AdminCsvExport({report,enabled}:{report:Report;enabled:boolean}){
 function download(kind:Kind,filename:string){
   if(!enabled)return;
   const grouped=new Map<string,{code:string;name:string;budget:number;po:number;paid:number;period:number;remaining:number}>();
   for(const row of report.rows){
     const existing=grouped.get(row.project_code)??{code:row.project_code,name:row.project_name,budget:0,po:0,paid:0,period:0,remaining:0};
     existing.budget+=Number(row.budget);existing.po+=Number(row.po);
     existing.paid+=Number(row.cumulative);existing.period+=Number(row.period);
     existing.remaining+=Number(row.remaining);grouped.set(row.project_code,existing);
   }
   const headers=['รหัสโครงการ','ชื่อโครงการ','กิจกรรม / หน่วยดำเนินการ','งบประมาณ (บาท)','PO คงค้าง (บาท)','เบิกจ่ายสะสม (บาท)','เบิกจ่ายในช่วงที่เลือก (บาท)','คงเหลือยังไม่เบิกจ่าย (บาท)','อัตราเบิกจ่าย (%)','ข้อมูล ณ'];
   let rows:(string|number)[][];
   if(kind==='activity'){
      rows=report.rows.filter(r=>r.project_code!=='RESERVE').map(r=>[
       r.project_code,r.project_name,r.name+' / '+(r.agency||'ไม่ระบุ'),r.budget,r.po,r.cumulative,r.period,r.remaining,
       r.budget?Number((r.cumulative/r.budget*100).toFixed(2)):0,report.asOf
      ]);
   }else{
      rows=[...grouped.values()].filter(p=>p.code!=='RESERVE'&&(kind==='core'?coreProject(p.code):!coreProject(p.code)))
       .map(p=>[p.code,p.name,'',p.budget,p.po,p.paid,p.period,p.remaining,p.budget?Number((p.paid/p.budget*100).toFixed(2)):0,report.asOf]);
   }
   const csv='\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download='nongbualamphu-budget-2570-'+filename+'-'+report.asOf+'.csv';
   document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="mon-box mon-csv-export mon-noprint" aria-label="ดาวน์โหลดไฟล์ข้อมูล CSV">
   <div className="mon-csv-heading"><FileSpreadsheet size={22} aria-hidden="true"/><div><h2>ดาวน์โหลดข้อมูลรายงาน</h2><p>เลือกประเภทรายงานที่ต้องการ · ข้อมูล ณ {report.asOf}</p></div></div>
   <div className="mon-csv-actions">{categories.map(item=>
    <button type="button" key={item.kind} disabled={!enabled} onClick={()=>download(item.kind,item.filename)}>
      <FileSpreadsheet size={17} aria-hidden="true"/>{item.label}
    </button>
   )}</div>
   {!enabled&&<p className="mon-muted">ข้อมูลรายงานยังไม่พร้อมดาวน์โหลด กรุณาลองใหม่อีกครั้ง</p>}
 </section>;
}
