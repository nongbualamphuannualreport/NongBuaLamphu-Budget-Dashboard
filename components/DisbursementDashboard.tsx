'use client';
import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import type { DisbursementReport, DisbursementRow } from '@/lib/disbursement';
import { moneyTH, percentTH } from '@/lib/disbursement';
import { BarChart3, CalendarDays, LockKeyhole, RefreshCw, Search, Menu, X, PanelLeftClose, PanelLeftOpen, LayoutDashboard, FolderTree, ListTree, FolderPlus, Wallet } from 'lucide-react';

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
  const [view,setView] = useState<'overview'|'projects'|'activities'|'extras'>('overview');
  const [menuOpen,setMenuOpen] = useState(false);
  const [menuCollapsed,setMenuCollapsed] = useState(false);
  useEffect(()=>{const value=new URLSearchParams(window.location.search).get('view');if(value==='reports'){const url=new URL(window.location.href);url.searchParams.set('view','overview');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}else if(value&&(['overview','projects','activities','extras'] as string[]).includes(value))setView(value as typeof view);},[]);
  const selectView=(next:typeof view)=>{setView(next);setSearch('');setMenuOpen(false);const url=new URL(window.location.href);url.searchParams.set('view',next);window.history.replaceState(null,'',url.pathname+url.search+url.hash);window.scrollTo({top:0,behavior:'smooth'});};
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

  const navItems=[{id:'overview' as const,label:'แดชบอร์ด',Icon:LayoutDashboard},{id:'projects' as const,label:'โครงการหลัก 10 โครงการ',Icon:FolderTree},{id:'activities' as const,label:'กิจกรรมย่อย',Icon:ListTree},{id:'extras' as const,label:'โครงการที่เพิ่มภายหลัง',Icon:FolderPlus}];
  return <main className="ds-wrap">
    <div className={'ds-screen ds-shell'+(menuCollapsed?' ds-shell-collapsed':'')}>
      {menuOpen&&<button className="ds-sidebar-backdrop" aria-label="ปิดเมนู" onClick={()=>setMenuOpen(false)}/>}
      <aside className={'ds-sidebar'+(menuOpen?' ds-sidebar-open':'')} aria-label="เมนูรายงานงบประมาณ">
        <div className="ds-sidebar-head"><span className="ds-mark">นภ</span><div className="ds-sidebar-brand"><strong>Budget Dashboard</strong><small>ปีงบประมาณ พ.ศ. 2570</small></div><button type="button" className="ds-sidebar-collapse" onClick={()=>setMenuCollapsed(v=>!v)} aria-label={menuCollapsed?"ขยายเมนูด้านซ้าย":"ย่อเมนูด้านซ้าย"} title={menuCollapsed?"ขยายเมนู":"ย่อเมนู"} aria-expanded={!menuCollapsed}>{menuCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button><button type="button" className="ds-sidebar-close" onClick={()=>setMenuOpen(false)} aria-label="ปิดเมนู"><X size={19}/></button></div>
        <div className="ds-sidebar-group">ภาพรวมและโครงการ</div>
        {navItems.slice(0,4).map(({id,label,Icon})=><button key={id} className={'ds-sidebar-link'+(view===id?' active':'')} onClick={()=>selectView(id)} aria-current={view===id?'page':undefined} title={label}><Icon size={19}/><span>{label}</span></button>)}
        <div className="ds-sidebar-group">บริหารเงินโอนเปลี่ยนแปลง</div>
        <Link className="ds-sidebar-link" href="/reserve"><Wallet size={19}/><span>เงินคงเหลือจากการโอนเปลี่ยนแปลง</span></Link>
        <div className="ds-sidebar-group">สำหรับเจ้าหน้าที่</div>
        <Link className="ds-sidebar-link" href="/admin"><LockKeyhole size={19}/><span>ระบบสำหรับเจ้าหน้าที่</span></Link>
      </aside>
      <div className="ds-shell-main">
      <header className="ds-top"><div className="ds-top-inner"><div className="ds-menu-controls"><button type="button" className="ds-menu-mobile" aria-label="เปิดเมนูด้านซ้าย" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Menu size={21}/></button></div>
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
        <div className="ds-section-title"><span>รายงานประจำปีงบประมาณ พ.ศ. 2570</span><h2>{navItems.find(item=>item.id===view)?.label}</h2><p>{view==='overview'?'ภาพรวมสถานะและผลการเบิกจ่าย':view==='projects'?'เฉพาะ 10 โครงการหลักตามบัญชีงบประมาณ':view==='activities'?'ค้นหาและตรวจสอบกิจกรรมย่อยทุกโครงการ':'แสดงโครงการเพิ่มภายหลังโดยไม่รวมเป็น 10 โครงการหลัก'}</p></div>
        <div className="ds-toolbar">
          <div className="ds-view-controls"><label>ช่วงข้อมูล <select aria-label="เลือกช่วงรายงาน" value={date?'history':'latest'} onChange={e=>{if(e.target.value==='latest')setDate('');else if(!date&&report)setDate(report.as_of_date);}}><option value="latest">ข้อมูลล่าสุด</option><option value="history">ข้อมูลย้อนหลัง</option></select></label>
            {date&&<label>ข้อมูล ณ หรือก่อน <input aria-label="วันที่ย้อนหลัง" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>}
            <button className="ds-icon-btn" onClick={()=>{setDate('');setReload(v=>v+1);}} title="รีเฟรชข้อมูลล่าสุด"><RefreshCw size={15}/> แสดงข้อมูลล่าสุด</button></div>
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
        </>}
        <footer className="ds-footer"><span>© จังหวัดหนองบัวลำภู · ระบบรายงานผลการเบิกจ่ายปีงบประมาณ พ.ศ. 2570</span><span>ข้อมูลจำแนกตามโครงการและกิจกรรม</span></footer>
      </div>
      </div>
    </div>
  </main>;
}
