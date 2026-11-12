'use client';

import {useMemo,useRef,useState} from 'react';
import type {MonitorActivity,MonitorPeriod} from '@/lib/monitor';
import {fmt} from '@/lib/monitor';
import './admin-pdf-export.css';

type Row=MonitorActivity & {cumulative:number;period:number;remaining:number};
type Report={
 from:string;to:string;asOf:string;rows:Row[];
 total:{budget:number;disbursed:number;period:number;remaining:number}
};
type Project={code:string;name:string;budget:number;paid:number;remaining:number};
type Props={report:Report;mode:MonitorPeriod;enabled:boolean};

const thaiDate=(value:string)=>new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{
 day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'
}).format(new Date(value+'T12:00:00+07:00'));
const today=()=>{
 const parts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Bangkok'}).formatToParts(new Date());
 const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
 return p.year+'-'+p.month+'-'+p.day;
};
function chunk<T>(list:T[],size:number):T[][]{
 const parts:T[][]=[];
 for(let i=0;i<list.length;i+=size)parts.push(list.slice(i,i+size));
 return parts;
}
function Money({value}:{value:number}){return <>{fmt(value)}</>}
function PageFrame({children,page,total,created,asOf}:{children:React.ReactNode;page:number;total:number;created:string;asOf:string}){
 return <section className="apdf-page" aria-label={'หน้าที่ '+page}>
  <div className="apdf-paper-body">{children}</div>
  <footer className="apdf-footer">
   <span>จังหวัดหนองบัวลำภู · รายงานผลการเบิกจ่ายงบประมาณ พ.ศ. 2570</span>
   <span>ข้อมูล ณ {thaiDate(asOf)} · {page}/{total}</span>
  </footer>
 </section>;
}
export function AdminPdfExport({report,mode,enabled}:Props){
 const sheets=useRef<HTMLDivElement>(null);
 const [generating,setGenerating]=useState<'summary'|'full'|null>(null);
 const [status,setStatus]=useState('');
 const projects=useMemo<Project[]>(()=>{
  const map=new Map<string,Project>();
  for(const r of report.rows){
   const prev=map.get(r.project_code)??{code:r.project_code,name:r.project_name,budget:0,paid:0,remaining:0};
   prev.budget+=Number(r.budget);prev.paid+=Number(r.cumulative);prev.remaining+=Number(r.remaining);
   map.set(r.project_code,prev);
  }
  return [...map.values()];
 },[report.rows]);
 const reportProjects=projects.filter(p=>p.code!=='RESERVE');
 const activities=report.rows.filter(r=>r.project_code!=='RESERVE');
 const started=reportProjects.filter(p=>p.paid>0);
 const pct=report.total.budget?Math.max(0,Math.min(100,report.total.disbursed/report.total.budget*100)):0;
 const projectPages=chunk(projects,8);
 const activityPages=chunk(activities,6);
 const totalPages=1+projectPages.length+activityPages.length;
 const periodLabel=mode==='daily'?'รายวัน':mode==='monthly'?'รายเดือน':'รายปีงบประมาณ';

 async function download(kind:'summary'|'full'){
  if(!enabled||generating)return;
  setGenerating(kind);setStatus('');
  try{
   const root=sheets.current;
   if(!root)throw new Error('ไม่พบแม่แบบรายงาน');
   await document.fonts.load('400 16px NotoThai');
   await document.fonts.load('700 16px NotoThai');
   await document.fonts.ready;
   const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas-pro'),import('jspdf')]);
   const nodes=Array.from(root.querySelectorAll<HTMLElement>('.apdf-page'));
   const selected=kind==='summary'?nodes.slice(0,1):nodes;
   if(!selected.length)throw new Error('ไม่มีหน้ารายงาน');
   const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
   for(let i=0;i<selected.length;i++){
    const canvas=await html2canvas(selected[i],{
     backgroundColor:'#fffdf9',scale:1.65,useCORS:true,logging:false,scrollX:0,scrollY:0,
     windowWidth:1200,onclone:(documentClone)=>{
      const cloned=documentClone.querySelector<HTMLElement>('.apdf-capture');
      if(cloned){cloned.style.left='0px';cloned.style.top='0px';}
     }
    });
    if(i>0)pdf.addPage('a4','portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,297,undefined,'FAST');
    canvas.width=0;canvas.height=0;
   }
   pdf.save('NongBuaLamphu-Budget-2570-'+kind+'-'+report.asOf+'.pdf');
   setStatus('สร้างไฟล์ PDF สำเร็จ · '+selected.length+' หน้า');
  }catch(e){
   setStatus('ไม่สามารถสร้าง PDF ได้: '+(e instanceof Error?e.message:'โปรดลองเปิดหลังบ้านใน Chrome หรือ Safari'));
  }finally{setGenerating(null);}
 }
 const created=today();
 return <section className="mon-box apdf-controls mon-noprint">
  <div>
   <h2>ดาวน์โหลดรายงาน PDF สำหรับผู้บริหาร</h2>
   <p>ใช้ข้อมูลเบิกจ่าย ณ {thaiDate(report.asOf)} · {periodLabel} · เฉพาะเจ้าหน้าที่หลังเข้าสู่ระบบ</p>
  </div>
  <div className="apdf-actions">
   <button type="button" disabled={!enabled||!!generating} onClick={()=>void download('summary')}>
    {generating==='summary'?'กำลังสร้างไฟล์...':'ดาวน์โหลด PDF สรุป 1 หน้า'}
   </button>
   <button type="button" disabled={!enabled||!!generating} onClick={()=>void download('full')}>
    {generating==='full'?'กำลังสร้างไฟล์...':'ดาวน์โหลด PDF รายละเอียดทุกกิจกรรม'}
   </button>
  </div>
  <p className="apdf-hint">รายงานเป็นกระดาษ A4 แนวตั้ง พร้อมตัวอักษรภาษาไทยจากหน้าเว็บ ไม่ต้องใช้ตัวอ่าน PDF ของ Messenger ในการสร้างไฟล์</p>
  {!enabled&&<p className="mon-error">กรุณารอข้อมูลครบถ้วนก่อนสร้างรายงาน</p>}
  {status&&<p role="status" className="apdf-status">{status}</p>}
  <div className="apdf-capture" ref={sheets} aria-hidden="true">
   <PageFrame page={1} total={1} created={created} asOf={report.asOf}>
    <header className="apdf-hero">
     <span className="apdf-pill">รายงานผลการเบิกจ่ายงบประมาณ</span>
     <h1>จังหวัดหนองบัวลำภู</h1><h2>ประจำปีงบประมาณ พ.ศ. 2570</h2>
     <p>รายงาน{periodLabel} · จัดทำวันที่ {thaiDate(created)}</p>
     <div className="apdf-hero-budget"><strong><Money value={report.total.budget}/></strong><span>บาท · งบประมาณรวม</span></div>
    </header>
    <div className="apdf-date">ข้อมูลเบิกจ่าย ณ {thaiDate(report.asOf)}</div>
    <div className="apdf-metrics">
     <div><span>ผลเบิกจ่ายสะสม</span><b><Money value={report.total.disbursed}/></b><small>บาท</small></div>
     <div><span>คงเหลือยังไม่เบิกจ่าย</span><b><Money value={report.total.remaining}/></b><small>บาท</small></div>
     <div className="apdf-rate"><span>อัตราการเบิกจ่าย</span><b>{pct.toFixed(2)}%</b><small>ของงบประมาณ</small></div>
    </div>
    <div className="apdf-section-heading"><h2>ความก้าวหน้าการเบิกจ่าย</h2><strong>{pct.toFixed(2)}%</strong></div>
    <div className="apdf-progress"><i style={{width:pct+'%'}}/></div>
    <div className="apdf-overview">
     <strong>สถานะรายโครงการ</strong>
     <div><b>{reportProjects.length}</b><small>โครงการทั้งหมด</small></div>
     <div><b>{started.length}</b><small>เริ่มเบิกจ่าย</small></div>
     <div><b>{reportProjects.length-started.length}</b><small>ยังไม่เบิกจ่าย</small></div>
    </div>
    <div className="apdf-section-heading"><h2>โครงการที่มีการเบิกจ่าย</h2></div>
    <div className="apdf-feature-list">{[...started].sort((a,b)=>b.paid-a.paid).slice(0,4).map((p,i)=>
      <div className="apdf-feature" key={p.code}><span>{String(i+1).padStart(2,'0')}</span><strong>{p.name}</strong><b>{fmt(p.paid)} บาท</b></div>
     )}{started.length===0&&<p>ยังไม่มีรายการเบิกจ่าย</p>}
    </div>
   </PageFrame>
   {projectPages.map((part,idx)=><PageFrame key={'p'+idx} page={idx+2} total={totalPages} created={created} asOf={report.asOf}>
     <div className="apdf-section-title"><h2>ผลการเบิกจ่ายรายโครงการ</h2><p>หน่วย: บาท · รายงาน{periodLabel} · {thaiDate(report.asOf)}</p></div>
     <div className="apdf-table-head"><span>โครงการ</span><span>งบประมาณ</span><span>เบิกจ่าย</span><span>คงเหลือ</span></div>
     {part.map((p,i)=><div className="apdf-row" key={p.code}>
       <div className="apdf-row-name"><small>{String(idx*8+i+1).padStart(2,'0')}</small><strong>{p.code==='RESERVE'?'รายการเงินเหลือจ่าย':p.name}</strong></div>
       <span><Money value={p.budget}/></span><span><Money value={p.paid}/></span><span><Money value={p.remaining}/></span>
     </div>)}
     <div className="apdf-page-total"><b>รวมงบประมาณ</b><strong><Money value={report.total.budget}/> บาท</strong></div>
   </PageFrame>)}
   {activityPages.map((part,idx)=><PageFrame key={'a'+idx} page={idx+2+projectPages.length} total={totalPages} created={created} asOf={report.asOf}>
     <div className="apdf-section-title"><h2>ผลการเบิกจ่ายรายกิจกรรมย่อย</h2><p>ข้อมูล ณ {thaiDate(report.asOf)} · หน่วย: บาท</p></div>
     <div className="apdf-table-head"><span>กิจกรรมและหน่วยดำเนินการ</span><span>งบประมาณ</span><span>เบิกจ่าย</span><span>คงเหลือ</span></div>
     {part.map((r,i)=><div className="apdf-row apdf-activity-row" key={r.id}>
       <div className="apdf-row-name"><small>{String(idx*6+i+1).padStart(2,'0')} · {r.project_code}</small><strong>{r.name}</strong><em>{r.agency}</em></div>
       <span><Money value={r.budget}/></span><span><Money value={r.cumulative}/></span><span><Money value={r.remaining}/></span>
     </div>)}
   </PageFrame>)}
  </div>
 </section>;
}
