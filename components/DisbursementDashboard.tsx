'use client';
import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import type { DisbursementReport, DisbursementRow } from '@/lib/disbursement';
import { moneyTH, percentTH } from '@/lib/disbursement';
import { BarChart3, CalendarDays, Download, FileSpreadsheet, FileText, LockKeyhole, RefreshCw, Search, ShieldCheck } from 'lucide-react';

import { ProjectHierarchy } from './ProjectHierarchy';

type PrintMode = 'summary' | 'full';
const thaiDate = (value:string) => {
  const d = new Date(value+'T12:00:00+07:00');
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(d);
};
const pct = (a:number,b:number) => Math.max(0,Math.min(100,b?a/b*100:0));
const bangkokToday = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Bangkok'}).formatToParts(new Date());
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${v.year}-${v.month}-${v.day}`;
};
function Metric({label,value,sub,tone}:{label:string,value:string,sub:string,tone?:'accent'|'blue'}){
  return <article className={`ds-kpi ${tone?'ds-kpi-'+tone:''}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>;
}
export function DisbursementDashboard(){
  const [report,setReport] = useState<DisbursementReport|null>(null);
  const [loading,setLoading] = useState(true);
  const [preview,setPreview] = useState(false);
  const [error,setError] = useState('');
  const [search,setSearch] = useState('');
  const [view,setView] = useState<'projects'|'activities'>('projects');
  const [date,setDate] = useState('');
  const [reload,setReload] = useState(0);
  const reportUrl=(mode:PrintMode)=>'/report?mode='+mode+(date?'&date='+encodeURIComponent(date):'');
  useEffect(()=>{
    let live = true;
    setLoading(true);setError('');
    fetch(date?`/api/disbursement?date=${encodeURIComponent(date)}`:'/api/disbursement',{cache:'no-store'})
      .then(async r=>{const x=await r.json();if(!r.ok)throw Error(x.error??'โหลดข้อมูลไม่สำเร็จ');if(live){setReport(x.report);setPreview(!!x.preview);}})
      .catch(e=>{if(live){setReport(null);setError(e instanceof Error?e.message:'โหลดข้อมูลไม่สำเร็จ');}})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[date,reload]);
  const filtered=useMemo(()=> (view==='projects'?report?.projects??[]:report?.activities??[]).filter(r=>
    [r.name,r.activity,r.agency,r.code,r.project_code].some(t=>String(t??'').toLowerCase().includes(search.toLowerCase()))
  ),[report,view,search]);
  const totalProjects=report?.projects.filter(p=>p.code!=='RESERVE').length??0;
  const active=report?.projects.filter(p=>p.code!=='RESERVE'&&p.disbursed>0).length??0;

  function csv(){
    if(!report)return;
    const rows=[['ประเภท','โครงการ/กิจกรรม','หน่วยงาน','งบประมาณ','เบิกจ่าย','คงเหลือ','ร้อยละ'],
      ...(view==='projects'?report.projects:report.activities).map(x=>[view==='projects'?'โครงการ':'กิจกรรม',x.name??x.activity??'',x.agency??'',x.budget,x.disbursed,x.remaining,percentTH(x.disbursed,x.budget)])];
    const esc=(v:unknown)=>{const s=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};
    const content='\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`nongbualamphu-budget-${report.as_of_date}.csv`;a.click();URL.revokeObjectURL(url);
  }
  return <main className="ds-wrap">
    <div className="ds-screen">
      <header className="ds-top"><div className="ds-top-inner">
        <div className="ds-brand"><span className="ds-mark">นภ</span><div><strong>รายงานผลการเบิกจ่ายงบประมาณ</strong><small>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</small></div></div>
        <nav><Link href="/admin"><LockKeyhole size={15}/> เข้าสู่ระบบเจ้าหน้าที่</Link></nav>
      </div></header>
      <div className="ds-content">
        <section className="ds-hero">
          <div className="ds-hero-text"><div className="ds-kicker"><span/> รายงานงบประมาณจังหวัด ประจำปีงบประมาณ พ.ศ. 2570</div><h1>รายงานผลการเบิกจ่ายงบประมาณ<br/><em>จังหวัดหนองบัวลำภู</em></h1>
            <p>สรุปวงเงินงบประมาณ ผลการเบิกจ่ายสะสม และยอดคงเหลือ พร้อมรายละเอียดจำแนกตามโครงการและกิจกรรมย่อย</p>
            <div className="ds-hero-meta"><span><CalendarDays size={14}/> {report?'ข้อมูลผลเบิกจ่าย ณ '+thaiDate(report.as_of_date):'กำลังตรวจสอบวันที่รายงาน'}</span><span><ShieldCheck size={14}/> {preview?'ข้อมูลระหว่างตรวจสอบ':'ข้อมูลที่เผยแพร่แล้ว'}</span></div>
          </div>
          <div className="ds-hero-total"><span>งบประมาณปี 2570</span><strong>{report?moneyTH(report.totals.budget):'—'}</strong><small>บาท · {totalProjects} โครงการ</small><div className="ds-hero-ring"/></div>
        </section>
        {preview&&report&&<div className="ds-status-note" role="status"><div className="ds-status-icon">!</div><div><strong>ข้อมูลตั้งต้น ณ {thaiDate(report.as_of_date)} — ยังไม่ยืนยันเผยแพร่</strong><p>ข้อมูลชุดนี้อยู่ระหว่างการตรวจสอบ โปรดตรวจสอบความถูกต้องก่อนนำไปใช้อ้างอิงในรายงานทางราชการ</p></div><Link href="/admin">ไปหลังบ้าน</Link></div>}
        <div className="ds-toolbar">
          <div className="ds-view-controls"><label>ช่วงข้อมูล <select aria-label="เลือกช่วงรายงาน" value={date?'history':'latest'} onChange={e=>{if(e.target.value==='latest')setDate('');else if(!date&&report)setDate(report.as_of_date);}}><option value="latest">ข้อมูลล่าสุด</option><option value="history">ข้อมูลย้อนหลัง</option></select></label>
            {date&&<label>ข้อมูล ณ หรือก่อน <input aria-label="วันที่ย้อนหลัง" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>}
            <button className="ds-icon-btn" onClick={()=>{setDate('');setReload(v=>v+1);}} title="รีเฟรชข้อมูลล่าสุด"><RefreshCw size={15}/> แสดงข้อมูลล่าสุด</button></div>
          <div className="ds-export-controls">
            <button onClick={csv} disabled={!report}><FileSpreadsheet size={15}/> ส่งออก CSV</button>
            {report?<Link className="ds-cta-outline ds-report-link" href={reportUrl('summary')}><FileText size={17}/> ดูรายงานสรุป / PDF</Link>:<button disabled>ดูรายงานสรุป / PDF</button>}
            {report?<Link className="ds-cta ds-report-link" href={reportUrl('full')}><Download size={17}/> ดูรายงานรายละเอียด / PDF</Link>:<button disabled>ดูรายงานรายละเอียด / PDF</button>}
          </div>
        </div>
        {loading?<section className="ds-empty"><BarChart3 size={30}/><h2>กำลังโหลดข้อมูล...</h2></section>:error?<section className="ds-empty ds-error"><h2>ไม่สามารถแสดงรายงานได้</h2><p>{error}</p></section>:!report?<section className="ds-empty"><BarChart3 size={32}/><h2>ยังไม่มีข้อมูลสำหรับช่วงเวลาที่เลือก</h2><p>กรุณาเลือกวันที่อื่นหรือติดต่อเจ้าหน้าที่</p></section>:<>
          <section className="ds-kpis" aria-label="สรุปผลการเบิกจ่าย">
            <Metric label="งบประมาณรวม" value={moneyTH(report.totals.budget)} sub="บาท"/>
            <Metric label="เบิกจ่ายสะสม" value={moneyTH(report.totals.disbursed)} sub="บาท" tone="blue"/>
            <Metric label="คงเหลือยังไม่เบิกจ่าย" value={moneyTH(report.totals.remaining)} sub="บาท"/>
            <Metric label="อัตราการเบิกจ่าย" value={percentTH(report.totals.disbursed,report.totals.budget)+'%'} sub="ของงบประมาณรวม" tone="accent"/>
          </section>
          <div className="ds-analysis-grid">
            <section className="ds-panel ds-progress"><div className="ds-panel-head"><div><span className="ds-overline">ความก้าวหน้าการใช้จ่ายงบประมาณ</span><h2>ความก้าวหน้าการเบิกจ่าย</h2></div><span className="ds-mini-tag">ข้อมูลสะสม</span></div>
              <strong>{percentTH(report.totals.disbursed,report.totals.budget)}%</strong>
              <div className="ds-track"><i style={{width:pct(report.totals.disbursed,report.totals.budget)+'%'}}/></div>
              <div className="ds-progress-caption"><span>เบิกจ่ายแล้ว <b>{moneyTH(report.totals.disbursed)} บาท</b></span><span>คงเหลือ <b>{moneyTH(report.totals.remaining)} บาท</b></span></div>
            </section>
            <section className="ds-panel ds-overview"><div className="ds-panel-head"><div><span className="ds-overline">สถานะโครงการ</span><h2>ภาพรวมรายโครงการ</h2></div></div>
              <div className="ds-overview-numbers"><div><strong>{totalProjects}</strong><span>โครงการทั้งหมด</span></div><div><strong>{active}</strong><span>เริ่มเบิกจ่ายแล้ว</span></div><div><strong>{totalProjects-active}</strong><span>ยังไม่เบิกจ่าย</span></div></div>
              <p>กดเลือกโครงการเพื่อดูโครงสร้างกิจกรรมหลัก กิจกรรมย่อย และรายละเอียดหน่วยดำเนินการ</p>
            </section>
          </div>
          <section className="ds-panel ds-details"><div className="ds-section-head"><div><span className="ds-overline">รายละเอียดผลการเบิกจ่าย</span><h2>ผลการเบิกจ่ายจำแนกตามโครงการและกิจกรรมย่อย</h2><p>เลือกโครงการเพื่อดูรายละเอียดกิจกรรมและหน่วยดำเนินการ</p></div><div className="ds-controls"><div className="ds-segment"><button className={view==='projects'?'active':''} onClick={()=>setView('projects')}>รายโครงการ ({report.projects.filter(p=>p.code!=='RESERVE').length})</button><button className={view==='activities'?'active':''} onClick={()=>setView('activities')}>รายกิจกรรม ({report.activities.length})</button></div><label className="ds-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาโครงการ / กิจกรรม / หน่วยงาน"/></label></div></div>
            {view==='projects'?<ProjectHierarchy report={report} search={search}/>:<div className="ds-table-wrap"><table className="ds-table"><thead><tr><th>ลำดับ</th><th>กิจกรรม / หน่วยดำเนินการ</th><th>งบประมาณ (บาท)</th><th>เบิกจ่ายแล้ว (บาท)</th><th>คงเหลือ (บาท)</th><th>ร้อยละ</th></tr></thead><tbody>{filtered.map((p:DisbursementRow,i:number)=><tr key={p.code??p.activity??i}><td>{String(i+1).padStart(2,'0')}</td><td><b>{p.name??p.activity}</b><small>{p.agency??(p.project_code??p.code??'')}</small></td><td>{moneyTH(p.budget)}</td><td className="ds-paid">{moneyTH(p.disbursed)}</td><td>{moneyTH(p.remaining)}</td><td><div className="ds-percent"><i style={{width:pct(p.disbursed,p.budget)+'%'}}/></div>{percentTH(p.disbursed,p.budget)}%</td></tr>)}</tbody></table></div>}
            <p className="ds-footnote">แหล่งข้อมูล: {report.source_file} · ข้อมูล ณ {thaiDate(report.as_of_date)}</p>
          </section>
        </>}
        <footer className="ds-footer"><span>© จังหวัดหนองบัวลำภู · ระบบรายงานผลการเบิกจ่ายปีงบประมาณ พ.ศ. 2570</span><span>ข้อมูลจำแนกตามโครงการและกิจกรรม</span></footer>
      </div>
    </div>
  </main>;
}
