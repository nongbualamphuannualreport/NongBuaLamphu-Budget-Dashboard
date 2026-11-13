'use client';

import {useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import type {MonitorActivity,MonitorPeriod,MonitorEntry} from '@/lib/monitor';
import {fmt} from '@/lib/monitor';
import './admin-pdf-export.css';
import {paginatePdfProjectDetails,paginateMeasuredPdfDetails,type PdfDetailItem} from '@/lib/pdf-project-pages';

type Row=MonitorActivity & {cumulative:number;period:number;po:number;remaining:number};
type Report={
 from:string;to:string;asOf:string;rows:Row[];
 total:{budget:number;po:number;disbursed:number;period:number;remaining:number}
};
type Project={code:string;name:string;budget:number;paid:number;remaining:number};
type Props={report:Report;mode:MonitorPeriod;enabled:boolean;entries:MonitorEntry[]};

const thaiDate=(value:string)=>new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{
 day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'
}).format(new Date(value+'T12:00:00+07:00'));
const today=()=>{
 const parts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Bangkok'}).formatToParts(new Date());
 const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
 return p.year+'-'+p.month+'-'+p.day;
};
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
export function AdminPdfExport({report,mode,enabled,entries}:Props){
 const sheets=useRef<HTMLDivElement>(null);
 const [generating,setGenerating]=useState<'summary'|'full'|null>(null);
 const [status,setStatus]=useState('');
 const [measuredLayout,setMeasuredLayout]=useState<{key:string;pages:PdfDetailItem[][]}|null>(null);
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
 const reductions=useMemo(()=>{
  const activityMap=new Map(activities.map(a=>[a.id,a]));
  return entries.filter(e=>Number(e.amount)<0&&e.paid_on<=report.asOf&&activityMap.has(e.activity_id))
   .map(e=>({id:e.id,activity_id:e.activity_id,project_code:activityMap.get(e.activity_id)!.project_code,
     paid_on:e.paid_on,amount:Number(e.amount),reference:e.reference||'',note:e.note||''}));
 },[entries,activities,report.asOf]);
 const periodReductions=reductions.filter(r=>r.paid_on>=report.from&&r.paid_on<=report.asOf);
 const periodReductionAmount=periodReductions.reduce((s,r)=>s+Math.abs(r.amount),0);
 const pct=report.total.budget?Math.max(0,Math.min(100,report.total.disbursed/report.total.budget*100)):0;
 const layoutKey=report.asOf+'|'+report.rows.map(r=>
  [r.id,r.project_code,r.project_name,r.name,r.agency,r.budget,r.cumulative,r.remaining].join(':')
 ).join('|')+'|'+reductions.map(r=>[r.id,r.activity_id,r.paid_on,r.amount,r.reference,r.note].join(':')).join('|');
 const defaultPages=paginatePdfProjectDetails(projects,activities.map(a=>({
  id:a.id,project_code:a.project_code,name:a.name,agency:a.agency,
  budget:a.budget,cumulative:a.cumulative,remaining:a.remaining
 })),reductions);
 const detailPages=measuredLayout?.key===layoutKey?measuredLayout.pages:defaultPages;
 const totalPages=1+detailPages.length;
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
   // Repack only at export time, after the real Thai fonts have loaded and
   // the browser has measured the actual item heights. Character-count
   // estimates left half of many pages blank in the old 9-page PDF.
   if(kind==='full'){
    const currentPages=Array.from(root.querySelectorAll<HTMLElement>('.apdf-page'));
    const firstDetail=currentPages[1];
    const body=firstDetail?.querySelector<HTMLElement>('.apdf-paper-body');
    const heading=firstDetail?.querySelector<HTMLElement>('.apdf-detail-intro');
    const cols=firstDetail?.querySelector<HTMLElement>('.apdf-detail-columns');
    const total=root.querySelector<HTMLElement>('.apdf-detail-grand-total');
    const rowElements=Array.from(root.querySelectorAll<HTMLElement>('.apdf-project-line, .apdf-subactivity-line, .apdf-reduction-line'));
    const items=detailPages.flat();
    if(!body||!heading||!cols||!total||rowElements.length!==items.length)
     throw new Error('ไม่สามารถวัดพื้นที่รายงานได้ครบถ้วน');
    const outerHeight=(el:HTMLElement)=>{
     const style=getComputedStyle(el);
     return el.getBoundingClientRect().height+
      (parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
    };
    const reserved=outerHeight(total)+26; // leave a safety gap above the page footer
    const paperHeight=body.getBoundingClientRect().height;
    const firstCapacity=paperHeight-outerHeight(heading)-outerHeight(cols)-reserved;
    const laterCapacity=paperHeight-reserved;
    const measured=paginateMeasuredPdfDetails(items,rowElements.map(outerHeight),firstCapacity,laterCapacity);
    // Commit pages synchronously before capturing; each PDF page must fit the
    // fixed A4 area, with no text sliced off at the bottom.
    flushSync(()=>{setMeasuredLayout({key:layoutKey,pages:measured});setGenerating(kind)});
   }
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
   <PageFrame page={1} total={generating==='full'?totalPages:1} created={created} asOf={report.asOf}>
    <header className="apdf-hero">
     <span className="apdf-pill">รายงานผลการเบิกจ่ายงบประมาณ</span>
     <h1>จังหวัดหนองบัวลำภู</h1><h2>ประจำปีงบประมาณ พ.ศ. 2570</h2>
     <p>รายงาน{periodLabel} · จัดทำวันที่ {thaiDate(created)}</p>
     <div className="apdf-hero-budget"><strong><Money value={report.total.budget}/></strong><span>บาท · งบประมาณรวม</span></div>
    </header>
    <div className="apdf-date">ข้อมูลเบิกจ่าย ณ {thaiDate(report.asOf)}</div>
    <div className="apdf-metrics">
     <div><span>ผลเบิกจ่ายสะสมสุทธิ</span><b><Money value={report.total.disbursed}/></b><small>บาท</small></div>
     <div><span>คงเหลือยังไม่เบิกจ่าย</span><b><Money value={report.total.remaining}/></b><small>บาท</small></div>
     <div className="apdf-rate"><span>อัตราการเบิกจ่าย</span><b>{pct.toFixed(2)}%</b><small>ของงบประมาณ</small></div>
    </div>
    {periodReductions.length>0&&
      <div className="apdf-reduction-summary">
        <div className="apdf-reduction-summary-copy">
          <strong>ลดยอดเบิกจ่ายในช่วงรายงาน</strong>
          <small>{periodReductions.length} รายการ · หักออกจากยอดเบิกจ่ายสะสมสุทธิแล้ว</small>
        </div>
        <div className="apdf-reduction-summary-value">
          <b>−{fmt(periodReductionAmount)}</b><span>บาท</span>
        </div>
      </div>}
    {report.total.po>0&&<div className="apdf-po-summary">
      <strong>PO คงค้าง (ยอดผูกพัน ยังไม่เบิกจ่าย)</strong>
      <b>{fmt(report.total.po)} บาท</b>
    </div>}
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
   {detailPages.map((items,idx)=>
    <PageFrame key={'detail-'+idx} page={idx+2} total={totalPages} created={created} asOf={report.asOf}>
      {idx===0&&<header className="apdf-detail-intro">
        <h2>ผลการเบิกจ่ายงบประมาณจำแนกตามโครงการและกิจกรรมย่อย</h2>
        <p>จังหวัดหนองบัวลำภู · ประจำปีงบประมาณ พ.ศ. 2570 · ข้อมูล ณ {thaiDate(report.asOf)}</p>
      </header>}
      {idx===0&&<div className="apdf-detail-columns">
        <span>โครงการ / กิจกรรมย่อย</span>
        <div className="apdf-detail-figures"><span>งบประมาณ</span><span>เบิกจ่ายสะสม</span><span>คงเหลือ</span></div>
      </div>}
      <div className="apdf-detail-list">
        {items.map((item,i)=>{
          if(item.kind==='project')return <section className="apdf-project-line" key={'project-'+item.project.code}>
            <div className="apdf-detail-main">
              <span className="apdf-project-index">{String(item.ordinal).padStart(2,'0')}</span>
              <strong>{item.project.code==='RESERVE'?'เงินคงเหลือจากการโอนเปลี่ยนแปลง':item.project.name}</strong>
            </div>
            <div className="apdf-detail-figures">
              <b>{fmt(item.project.budget)}</b>
              <b className="apdf-paid">{fmt(item.project.paid)}</b>
              <b>{fmt(item.project.remaining)}</b>
            </div>
          </section>;
          if(item.kind==='activity')return <div className="apdf-subactivity-line" key={'activity-'+item.row.id}>
            <div className="apdf-detail-main">
              <span className="apdf-subactivity-index">{item.ordinal}.</span>
              <div>
                <strong>{item.row.name}</strong>
                {item.row.agency&&<small>{item.row.agency}</small>}
                {report.rows.find(a=>a.id===item.row.id)?.po>0&&
                  <small>PO คงค้าง {fmt(report.rows.find(a=>a.id===item.row.id)?.po??0)} บาท</small>}
              </div>
            </div>
            <div className="apdf-detail-figures">
              <span>{fmt(item.row.budget)}</span>
              <span className="apdf-paid">{fmt(item.row.cumulative)}</span>
              <span>{fmt(item.row.remaining)}</span>
            </div>
          </div>;
          return <div className="apdf-reduction-line" key={'reduction-'+item.row.id}>
            <div className="apdf-detail-main">
              <span className="apdf-reduction-marker">−</span>
              <div>
                <strong>ลดยอดเบิกจ่าย · {thaiDate(item.row.paid_on)}</strong>
                {(item.row.reference||item.row.note)&&
                  <small>{[item.row.reference,item.row.note].filter(Boolean).join(' · ')}</small>}
              </div>
            </div>
            <div className="apdf-detail-figures">
              <span></span><b>−{fmt(Math.abs(item.row.amount))}</b><span></span>
            </div>
          </div>;
        })}
      </div>
      {idx===detailPages.length-1&&<div className="apdf-detail-grand-total">
        <strong>รวมงบประมาณทั้งสิ้น</strong>
        <div className="apdf-detail-figures">
          <b>{fmt(report.total.budget)}</b>
          <b>{fmt(report.total.disbursed)}</b>
          <b>{fmt(report.total.remaining)}</b>
        </div>
      </div>}
    </PageFrame>)}
  </div>
 </section>;
}
