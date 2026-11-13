'use client';
import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import type { DisbursementReport, DisbursementRow } from '@/lib/disbursement';
import { moneyTH, percentTH } from '@/lib/disbursement';
import { BarChart3, CalendarDays, FileSpreadsheet, LockKeyhole, RefreshCw, Search, Menu, X, LayoutDashboard, FolderTree, ListTree, FolderPlus, Wallet, Download } from 'lucide-react';

import { ProjectHierarchy } from './ProjectHierarchy';

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
  const [view,setView] = useState<'overview'|'projects'|'activities'|'extras'|'reports'>('overview');
  const [menuOpen,setMenuOpen] = useState(false);
  const [menuCollapsed,setMenuCollapsed] = useState(false);
  const selectView=(next:typeof view)=>{setView(next);setSearch('');setMenuOpen(false);window.scrollTo({top:0,behavior:'smooth'});};
  const [date,setDate] = useState('');
  const [reload,setReload] = useState(0);
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
  const totalProjects=report?.projects.filter(p=>/^P(0[1-9]|10)$/.test(String(p.code))).length??0;
  const extraProjects=report?.projects.filter(p=>p.code!=='RESERVE'&&!/^P(0[1-9]|10)$/.test(String(p.code))).length??0;
  const active=report?.projects.filter(p=>/^P(0[1-9]|10)$/.test(String(p.code))&&p.disbursed>0).length??0;

  function csv(kind:'projects'|'activities'|'extras'='activities'){
    if(!report)return;
    const rows=[['ประเภท','โครงการ/กิจกรรม','หน่วยงาน','งบประมาณ','PO','เบิกจ่าย','คงเหลือ','ร้อยละ'],
      ...(kind==='projects'?report.projects.filter(p=>/^P(0[1-9]|10)$/.test(String(p.code))):kind==='extras'?report.projects.filter(p=>p.code!=='RESERVE'&&!/^P(0[1-9]|10)$/.test(String(p.code))):report.activities).map(x=>[kind==='activities'?'กิจกรรม':'โครงการ',x.name??x.activity??'',x.agency??'',x.budget,x.po,x.disbursed,x.remaining,percentTH(x.disbursed,x.budget)])];
    const esc=(v:unknown)=>{const s=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};
    const content='\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`nongbualamphu-budget-${report.as_of_date}.csv`;a.click();URL.revokeObjectURL(url);
  }
  const navItems=[{id:'overview' as const,label:'แดชบอร์ด',Icon:LayoutDashboard},{id:'projects' as const,label:'โครงการหลัก 10 โครงการ',Icon:FolderTree},{id:'activities' as const,label:'กิจกรรมย่อย',Icon:ListTree},{id:'extras' as const,label:'โครงการที่เพิ่มภายหลัง',Icon:FolderPlus},{id:'reports' as const,label:'รายงานและส่งออกข้อมูล',Icon:Download}];
  return <main className="ds-wrap">
    <div className={'ds-screen ds-shell'+(menuCollapsed?' ds-shell-collapsed':'')}>
      {menuOpen&&<button className="ds-sidebar-backdrop" aria-label="ปิดเมนู" onClick={()=>setMenuOpen(false)}/>}
      <aside className={'ds-sidebar'+(menuOpen?' ds-sidebar-open':'')} aria-label="เมนูรายงานงบประมาณ">
        <div className="ds-sidebar-head"><span className="ds-mark">นภ</span><div><strong>Budget Dashboard</strong><small>ปีงบประมาณ พ.ศ. 2570</small></div><button className="ds-sidebar-close" onClick={()=>setMenuOpen(false)} aria-label="ปิดเมนู"><X size={19}/></button></div>
        <div className="ds-sidebar-group">ภาพรวมและโครงการ</div>
        {navItems.slice(0,4).map(({id,label,Icon})=><button key={id} className={'ds-sidebar-link'+(view===id?' active':'')} onClick={()=>selectView(id)} aria-current={view===id?'page':undefined} title={label}><Icon size={19}/><span>{label}</span></button>)}
        <div className="ds-sidebar-group">บริหารเงินโอนเปลี่ยนแปลง</div>
        <Link className="ds-sidebar-link" href="/reserve"><Wallet size={19}/><span>เงินคงเหลือจากการโอนเปลี่ยนแปลง</span></Link>
        <div className="ds-sidebar-group">รายงานและจัดการ</div>
        {navItems.slice(4).map(({id,label,Icon})=><button key={id} className={'ds-sidebar-link'+(view===id?' active':'')} onClick={()=>selectView(id)} aria-current={view===id?'page':undefined} title={label}><Icon size={19}/><span>{label}</span></button>)}
        <Link className="ds-sidebar-link" href="/admin"><LockKeyhole size={19}/><span>ระบบสำหรับเจ้าหน้าที่</span></Link>
      </aside>
      <div className="ds-shell-main">
      <header className="ds-top"><div className="ds-top-inner"><div className="ds-menu-controls"><button className="ds-menu-mobile" aria-label="เปิดเมนู" onClick={()=>setMenuOpen(true)}><Menu size={21}/></button><button className="ds-menu-desktop" aria-label={menuCollapsed?'ขยายเมนู':'ย่อเมนู'} onClick={()=>setMenuCollapsed(v=>!v)}><Menu size={20}/></button></div>
        <div className="ds-brand"><span className="ds-mark">นภ</span><div><strong>รายงานผลการเบิกจ่ายงบประมาณ</strong><small>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</small></div></div>
        <nav><Link href="/admin"><LockKeyhole size={15}/> เข้าสู่ระบบเจ้าหน้าที่</Link></nav>
      </div></header>
      <div className="ds-content">
        {view==='overview'&&<section className="ds-hero">
          <div className="ds-hero-text"><div className="ds-kicker"><span/> รายงานงบประมาณจังหวัด ประจำปีงบประมาณ พ.ศ. 2570</div><h1>รายงานผลการเบิกจ่ายงบประมาณ<br/><em>จังหวัดหนองบัวลำภู</em></h1>
            <p>สรุปวงเงินงบประมาณ ผลการเบิกจ่ายสะสม และยอดคงเหลือ พร้อมรายละเอียดจำแนกตามโครงการและกิจกรรมย่อย</p>
            <div className="ds-hero-meta"><span><CalendarDays size={14}/> {report?'ข้อมูลผลเบิกจ่าย ณ '+thaiDate(report.as_of_date):'กำลังตรวจสอบวันที่รายงาน'}</span></div>
          </div>
          <div className="ds-hero-total"><span>งบประมาณปี 2570</span><strong>{report?moneyTH(report.totals.budget):'—'}</strong><small>บาท · {totalProjects} โครงการ</small><div className="ds-hero-ring"/></div>
        </section>}
        <div className="ds-section-title"><span>รายงานประจำปีงบประมาณ พ.ศ. 2570</span><h2>{navItems.find(item=>item.id===view)?.label}</h2><p>{view==='overview'?'ภาพรวมสถานะและผลการเบิกจ่าย':view==='projects'?'เฉพาะ 10 โครงการหลักตามบัญชีงบประมาณ':view==='activities'?'ค้นหาและตรวจสอบกิจกรรมย่อยทุกโครงการ':view==='extras'?'แสดงโครงการเพิ่มภายหลังโดยไม่รวมเป็น 10 โครงการหลัก':'เลือกช่วงข้อมูลและส่งออกไฟล์ CSV'}</p></div>
        <div className="ds-toolbar">
          <div className="ds-view-controls"><label>ช่วงข้อมูล <select aria-label="เลือกช่วงรายงาน" value={date?'history':'latest'} onChange={e=>{if(e.target.value==='latest')setDate('');else if(!date&&report)setDate(report.as_of_date);}}><option value="latest">ข้อมูลล่าสุด</option><option value="history">ข้อมูลย้อนหลัง</option></select></label>
            {date&&<label>ข้อมูล ณ หรือก่อน <input aria-label="วันที่ย้อนหลัง" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>}
            <button className="ds-icon-btn" onClick={()=>{setDate('');setReload(v=>v+1);}} title="รีเฟรชข้อมูลล่าสุด"><RefreshCw size={15}/> แสดงข้อมูลล่าสุด</button></div>
          <div className="ds-export-controls">
            <button type="button" onClick={()=>csv(view==='projects'?'projects':view==='extras'?'extras':'activities')} disabled={!report}><FileSpreadsheet size={17}/> ส่งออกข้อมูล CSV</button>

          </div>
        </div>
        {loading?<section className="ds-empty"><BarChart3 size={30}/><h2>กำลังโหลดข้อมูล...</h2></section>:error?<section className="ds-empty ds-error"><h2>ไม่สามารถแสดงรายงานได้</h2><p>{error}</p></section>:!report?<section className="ds-empty"><BarChart3 size={32}/><h2>ยังไม่มีข้อมูลสำหรับช่วงเวลาที่เลือก</h2><p>กรุณาเลือกวันที่อื่นหรือติดต่อเจ้าหน้าที่</p></section>:<>
          {view==='overview'&&<><section className="ds-kpis" aria-label="สรุปผลการเบิกจ่าย">
            <Metric label="งบประมาณรวม" value={moneyTH(report.totals.budget)} sub="บาท"/>
            <Metric label="PO คงค้าง" value={moneyTH(report.totals.po)} sub="บาท · ยอดผูกพันตามสัญญา"/>
            <Metric label="เบิกจ่ายสะสม" value={moneyTH(report.totals.disbursed)} sub="บาท" tone="blue"/>
            <Metric label="คงเหลือยังไม่เบิกจ่าย" value={moneyTH(report.totals.remaining)} sub="บาท"/>
            <Metric label="อัตราการเบิกจ่าย" value={percentTH(report.totals.disbursed,report.totals.budget)+'%'} sub="ของงบประมาณรวม" tone="accent"/>
          </section>
          <div className="ds-analysis-grid">
            <section className="ds-panel ds-progress"><div className="ds-panel-head"><div><span className="ds-overline">ความก้าวหน้าการใช้จ่ายงบประมาณ</span><h2>ความก้าวหน้าการเบิกจ่าย</h2></div><span className="ds-mini-tag">ข้อมูลสะสม</span></div>
              <strong>{percentTH(report.totals.disbursed,report.totals.budget)}%</strong>
              <div className="ds-track"><i style={{width:pct(report.totals.disbursed,report.totals.budget)+'%'}}/></div>
              <div className="ds-progress-caption"><span>PO คงค้าง <b>{moneyTH(report.totals.po)} บาท</b></span><span>เบิกจ่ายแล้ว <b>{moneyTH(report.totals.disbursed)} บาท</b></span><span>คงเหลือ <b>{moneyTH(report.totals.remaining)} บาท</b></span></div>
            </section>
            <section className="ds-panel ds-overview"><div className="ds-panel-head"><div><span className="ds-overline">สถานะโครงการ</span><h2>ภาพรวมรายโครงการ</h2></div></div>
              <div className="ds-overview-numbers"><div><strong>{totalProjects}</strong><span>โครงการหลัก</span></div><div><strong>{active}</strong><span>เริ่มเบิกจ่ายแล้ว</span></div><div><strong>{totalProjects-active}</strong><span>ยังไม่เบิกจ่าย (โครงการหลัก)</span></div></div>
              <p>โครงการเพิ่มเติม {extraProjects} โครงการแสดงแยกจากโครงการหลัก · กดดูรายละเอียดโครงการหรือเงินโอนเปลี่ยนแปลงได้</p>
            </section>
          </div>
          </>}
          {(view==='projects'||view==='activities'||view==='extras')&&<section className="ds-panel ds-details"><div className="ds-section-head"><div><span className="ds-overline">รายละเอียดผลการเบิกจ่าย</span><h2>{view==='projects'?'รายละเอียด 10 โครงการหลัก':view==='extras'?'โครงการเพิ่มเติมนอกบัญชีหลัก':'ผลการเบิกจ่ายรายกิจกรรมย่อย'}</h2><p>10 โครงการหลักตามแผนเดิม · โครงการเพิ่มเติมแสดงแยก · <Link href="/reserve">ติดตามเงินโอนเปลี่ยนแปลง</Link></p></div><div className="ds-controls"><label className="ds-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาโครงการ / กิจกรรม / หน่วยงาน"/></label></div></div>
            {view==='projects'?<ProjectHierarchy report={report} search={search} mode="core"/>:view==='extras'?<ProjectHierarchy report={report} search={search} mode="extras"/>:<div className="ds-table-wrap"><table className="ds-table"><thead><tr><th>ลำดับ</th><th>กิจกรรม / หน่วยดำเนินการ</th><th>งบประมาณ (บาท)</th><th>PO (บาท)</th><th>เบิกจ่ายแล้ว (บาท)</th><th>คงเหลือ (บาท)</th><th>ร้อยละ</th></tr></thead><tbody>{filtered.map((p:DisbursementRow,i:number)=><tr key={p.code??p.activity??i}><td>{String(i+1).padStart(2,'0')}</td><td><b>{p.name??p.activity}</b><small>{p.agency??(p.project_code??p.code??'')}</small></td><td>{moneyTH(p.budget)}</td><td className="ds-po">{moneyTH(p.po)}</td><td className="ds-paid">{moneyTH(p.disbursed)}</td><td>{moneyTH(p.remaining)}</td><td><div className="ds-percent"><i style={{width:pct(p.disbursed,p.budget)+'%'}}/></div>{percentTH(p.disbursed,p.budget)}%</td></tr>)}</tbody></table></div>}
            <p className="ds-footnote">แหล่งข้อมูล: {report.source_file} · ข้อมูล ณ {thaiDate(report.as_of_date)}</p>
          </section>}
          {view==='reports'&&<section className="ds-panel"><h2>ดาวน์โหลดรายงานผลการเบิกจ่าย</h2><p>ข้อมูล ณ {thaiDate(report.as_of_date)} · เลือกส่งออกตามประเภทข้อมูล</p><div className="ds-report-actions"><button type="button" onClick={()=>csv('projects')}>ดาวน์โหลดรายโครงการ CSV</button><button type="button" onClick={()=>csv('activities')}>ดาวน์โหลดรายกิจกรรม CSV</button><Link href="/reserve">ดูรายงานเงินโอนเปลี่ยนแปลง</Link></div></section>}
        </>}
        <footer className="ds-footer"><span>© จังหวัดหนองบัวลำภู · ระบบรายงานผลการเบิกจ่ายปีงบประมาณ พ.ศ. 2570</span><span>ข้อมูลจำแนกตามโครงการและกิจกรรม</span></footer>
      </div>
      </div>
    </div>
  </main>;
}
