'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode,type KeyboardEvent} from 'react';
import Link from 'next/link';
import {Plus,Search,X} from 'lucide-react';
import {createClient} from '@supabase/supabase-js';
import {bounds,fmt,reportRows,type MonitorActivity,type MonitorEntry,type MonitorPeriod} from '@/lib/monitor';
import hierarchyMetadata from '@/data/hierarchy-metadata.json';
import {AdminPdfExport} from './AdminPdfExport';
import {AdminCsvExport} from './AdminCsvExport';
import {AdminNavigation,type AdminView} from './AdminNavigation';
import type {MonitorPoEntry} from '@/lib/po';
import {effectiveActivities,type ReallocationTransfer} from '@/lib/reallocation';
import './monitor.css';
const today=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}`;};
function thai(d:string){return new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(d+'T12:00:00+07:00'));}
function AdminModal({title,subtitle,children,onClose,busy}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;busy:boolean}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   const last=document.activeElement instanceof HTMLElement?document.activeElement:null;
   const scroll=document.body.style.overflow;
   document.body.style.overflow='hidden';
   const focus=window.requestAnimationFrame(()=>{const first=ref.current?.querySelector<HTMLElement>('.mon-modal-body input:not(:disabled), .mon-modal-body select:not(:disabled), .mon-modal-body textarea:not(:disabled)');(first??ref.current)?.focus();});
   return()=>{window.cancelAnimationFrame(focus);document.body.style.overflow=scroll;last?.focus();};
 },[]);
 function keys(event:KeyboardEvent<HTMLDivElement>){
   if(event.key==='Escape'){event.stopPropagation();if(!busy)onClose();return;}
   if(event.key!=='Tab')return;
   const all=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')??[]).filter(el=>el.getClientRects().length>0);
   if(!all.length)return;
   if(event.shiftKey&&document.activeElement===all[0]){event.preventDefault();all[all.length-1].focus();}
   else if(!event.shiftKey&&document.activeElement===all[all.length-1]){event.preventDefault();all[0].focus();}
 }
 return <div className="mon-modal-backdrop mon-noprint" onKeyDown={keys}>
   <div ref={ref} tabIndex={-1} className="mon-modal-panel" role="dialog" aria-modal="true" aria-labelledby="mon-modal-title" aria-describedby={subtitle?'mon-modal-description':undefined}>
     <div className="mon-modal-header"><div><span className="mon-modal-eyebrow">ระบบจัดการข้อมูล · ปีงบประมาณ 2570</span><h2 id="mon-modal-title">{title}</h2>{subtitle&&<p id="mon-modal-description">{subtitle}</p>}</div><button type="button" className="mon-modal-close" aria-label="ปิดหน้าต่าง" onClick={onClose} disabled={busy}>×</button></div>
     <div className="mon-modal-body">{children}</div>
   </div>
 </div>;
}
export function MonitorAdmin(){
 const client=useMemo(()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;return url&&key?createClient(url,key):null;},[]);
 const [session,setSession]=useState<string|null>(null),[ready,setReady]=useState(false),[loadedOnce,setLoadedOnce]=useState(false);
 const [loginEmail,setLoginEmail]=useState(''),[loginPass,setLoginPass]=useState('');
 const [activities,setActivities]=useState<MonitorActivity[]>([]),[entries,setEntries]=useState<MonitorEntry[]>([]),[poEntries,setPoEntries]=useState<MonitorPoEntry[]>([]),[transfers,setTransfers]=useState<ReallocationTransfer[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[truncated,setTruncated]=useState(false);
 const [mode,setMode]=useState<MonitorPeriod>('daily'),[date,setDate]=useState(today),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const [entryId,setEntryId]=useState(''),[activityId,setActivityId]=useState(''),[amount,setAmount]=useState(''),[paidOn,setPaidOn]=useState(today),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const [entryVisible,setEntryVisible]=useState(false),[entryKind,setEntryKind]=useState<'disbursement'|'reduction'>('disbursement'),[modalError,setModalError]=useState('');
 const [masterVisible,setMasterVisible]=useState(false),[masterNew,setMasterNew]=useState(false),[masterId,setMasterId]=useState(''),[masterProject,setMasterProject]=useState(''),[masterProjectName,setMasterProjectName]=useState(''),[masterName,setMasterName]=useState(''),[masterAgency,setMasterAgency]=useState(''),[masterBudget,setMasterBudget]=useState(''),[projectEdit,setProjectEdit]=useState('');
 const [section,setSection]=useState<AdminView>('overview');
 const [poVisible,setPoVisible]=useState(false),[poActivityId,setPoActivityId]=useState(''),[poKind,setPoKind]=useState<'add'|'release'|'pay'>('add');
 const [poDate,setPoDate]=useState(today),[poAmount,setPoAmount]=useState(''),[poReference,setPoReference]=useState(''),[poNote,setPoNote]=useState('');
 useEffect(()=>{
  const allowed=new Set<AdminView>(['overview','projects','po','disbursements','history','pdf']);
  const view=new URLSearchParams(window.location.search).get('view') as AdminView|null;
  if(view&&allowed.has(view))setSection(view);
 },[]);
 const selectSection=(view:AdminView)=>{
  setSection(view);
  const url=new URL(window.location.href);
  url.searchParams.set('view',view);
  window.history.replaceState(null,'',url.pathname+url.search+url.hash);
  window.scrollTo({top:0,behavior:'smooth'});
 };
 const getToken=useCallback(async()=>{if(!client)throw Error('ยังไม่ได้เชื่อม Supabase');const {data}=await client.auth.getSession();if(!data.session)throw Error('กรุณาเข้าสู่ระบบใหม่');return data.session.access_token;},[client]);
 const refresh=useCallback(async()=>{setBusy(true);setError('');try{const token=await getToken();const res=await fetch('/api/admin/monitor',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const json=await res.json();if(!res.ok)throw Error(json.error||'ไม่สามารถอ่านข้อมูลได้');setActivities(json.activities);setEntries(json.entries);setPoEntries(json.poEntries??[]);setTransfers(json.transfers??[]);setLoadedOnce(true);setTruncated(!!json.truncated);}catch(e){setError(e instanceof Error?e.message:'อ่านข้อมูลไม่สำเร็จ');}finally{setBusy(false);}},[getToken]);
 useEffect(()=>{if(!client){setReady(true);return;}client.auth.getSession().then(({data})=>{setSession(data.session?.access_token??null);setReady(true);});const {data:{subscription}}=client.auth.onAuthStateChange((_e,s)=>setSession(s?.access_token??null));return()=>subscription.unsubscribe();},[client]);
 useEffect(()=>{if(session)void refresh();},[Boolean(session),refresh]);
 const report=useMemo(()=>reportRows(effectiveActivities(activities,transfers,date),
  entries,mode,date,poEntries),[activities,transfers,entries,poEntries,mode,date]);
 const projectCodes=useMemo(()=>[...new Set(report.rows.map(a=>a.project_code))],[report]);
 const filtered=projectCodes.filter(p=>report.rows.some(a=>a.project_code===p&&(a.project_name+a.name+a.agency).toLowerCase().includes(search.toLowerCase())));
 const history=[...new Set(entries.map(e=>e.paid_on))].sort().reverse();
 const baseline='2026-11-10';
 const budgetTotal=report.total.budget;
 const reserveCount=transfers.filter(t=>t.allocated_on<=date&&(!t.cancelled_on||t.cancelled_on>date)).length;
 const reserveAllocated=transfers.filter(t=>t.allocated_on<=date&&(!t.cancelled_on||t.cancelled_on>date)).reduce((sum,t)=>sum+Number(t.amount),0);
 const reserveLeft=Number(activities.find(a=>a.project_code==='RESERVE')?.budget??0)-reserveAllocated;
 const masterCurrent=activities.find(a=>a.id===masterId);
 function editMaster(a:MonitorActivity){
   setMasterVisible(true);setMasterNew(false);setMasterId(a.id);setMasterProject(a.project_code);setMasterProjectName(a.project_name);
   setMasterName(a.name);setMasterAgency(a.agency);setMasterBudget(String(a.budget));
   setModalError('');setSection('projects');setSelected(a.project_code);
 }
 function createMaster(projectCode=''){
   setMasterVisible(true);setMasterNew(true);setMasterId('');setMasterProject(projectCode);
   setMasterProjectName(activities.find(a=>a.project_code===projectCode)?.project_name??'');
   setMasterName('');setMasterAgency('');setMasterBudget('');
   setModalError('');setSection('projects');
 }
 async function mutateMaster(payload:Record<string,unknown>){
   setBusy(true);setError('');setMessage('');
   try{
     setModalError('');
     const response=await fetch('/api/admin/activities',{method:'POST',
       headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`},
       body:JSON.stringify(payload)});
     const result=await response.json();
     if(!response.ok)throw Error(result.error??'แก้ไขข้อมูลหลักไม่สำเร็จ');
     await refresh();
     setMasterVisible(false);setMasterId('');setProjectEdit('');
     setMessage(result.warning??'บันทึกข้อมูลโครงการและกิจกรรมเรียบร้อยแล้ว');
   }catch(ex){setModalError(ex instanceof Error?ex.message:'จัดการข้อมูลไม่สำเร็จ');}
   finally{setBusy(false);}
 }

 async function mutate(payload:Record<string,unknown>){setBusy(true);setError('');setModalError('');setMessage('');try{const res=await fetch('/api/admin/monitor',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`},body:JSON.stringify(payload)});const x=await res.json();if(!res.ok)throw Error(x.error||'บันทึกไม่สำเร็จ');await refresh();setMessage(payload.action==='initialize'?'นำเข้าข้อมูลกิจกรรมตั้งต้นสำเร็จ':payload.action==='delete-entry'?'ลบรายการแล้ว':'บันทึกรายการเบิกจ่าย/ลดยอดเรียบร้อยแล้ว');if(payload.action==='save-entry')setEntryVisible(false);setEntryId('');setAmount('');setReference('');setNote('');}catch(e){const msg=e instanceof Error?e.message:'ดำเนินการไม่สำเร็จ';if(payload.action==='save-entry')setModalError(msg);else setError(msg);}finally{setBusy(false);}}
 function editEntry(e:MonitorEntry){setEntryId(e.id);setActivityId(e.activity_id);setPaidOn(e.paid_on);setAmount(String(Math.abs(e.amount)));setEntryKind(e.amount<0?'reduction':'disbursement');setReference(e.reference);setNote(e.note);setModalError('');setEntryVisible(true);}
 function openNew(id:string,kind:'disbursement'|'reduction'='disbursement'){setActivityId(id);setEntryKind(kind);setPaidOn(today());setEntryId('');setAmount('');setReference('');setNote('');setModalError('');setEntryVisible(true);}
 function openPo(id:string,kind:'add'|'release'|'pay'){
  setPoActivityId(id);setPoKind(kind);setPoDate(today());
  setPoAmount('');setPoReference('');setPoNote('');setModalError('');setPoVisible(true);
 }
 async function submitPo(){
  setBusy(true);setModalError('');setError('');
  try{
   const response=await fetch('/api/admin/po',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`},
    body:JSON.stringify({activity_id:poActivityId,po_on:poDate,amount:Number(poAmount),kind:poKind,reference:poReference,note:poNote})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error??'บันทึก PO ไม่สำเร็จ');
   await refresh();setPoVisible(false);
   setMessage(poKind==='pay'?'จ่ายเงินจาก PO และบันทึกยอดเบิกจ่ายเรียบร้อยแล้ว':'บันทึกรายการ PO เรียบร้อยแล้ว');
  }catch(err){setModalError(err instanceof Error?err.message:'บันทึก PO ไม่สำเร็จ');}
  finally{setBusy(false);}
 }
 function forPeriod(e:MonitorEntry){return e.paid_on>=report.from&&e.paid_on<=report.to;}
 if(!ready)return <main className="mon-wrap">กำลังตรวจสอบสิทธิ์...</main>;
 if(!session)return <main className="mon-wrap mon-login"><h1>ระบบจัดการข้อมูลการเบิกจ่ายงบประมาณ</h1><p className="mon-release-label">ระบบสำหรับเจ้าหน้าที่</p><p>เข้าสู่ระบบเจ้าหน้าที่เพียงครั้งเดียว เพื่อดูรายงานและบันทึกยอดเบิกจ่ายรายกิจกรรมย่อย</p><form className="mon-box mon-login-card" onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{if(!client)throw Error('ยังไม่สามารถเชื่อมต่อระบบข้อมูลได้ กรุณาติดต่อผู้ดูแล');const r=await client.auth.signInWithPassword({email:loginEmail,password:loginPass});if(r.error)throw r.error;}catch(ex){setError(ex instanceof Error?ex.message:'เข้าสู่ระบบไม่สำเร็จ');}finally{setBusy(false)}}}><label>อีเมล<input type="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}/></label><label>รหัสผ่าน<input type="password" required value={loginPass} onChange={e=>setLoginPass(e.target.value)}/></label>{error&&<p className="mon-error">{error}</p>}<button className="mon-login-submit" disabled={busy}>เข้าสู่ระบบ</button></form></main>;
 return <main className="mon-wrap">
  <header className="mon-header"><div><Link href="/">← กลับสู่หน้ารายงานสาธารณะ</Link><h1>ศูนย์รายงานผลการเบิกจ่าย</h1><p className="mon-release-label">บันทึกและตรวจสอบข้อมูลภายใน</p><p>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570 · ใช้ยอดเบิกจ่ายรายกิจกรรมย่อยเป็นหลัก</p></div><div className="mon-actions"><button onClick={async()=>{await client?.auth.signOut();setSession(null);}}>ออกจากระบบ</button><button onClick={()=>void refresh()} disabled={busy}>แสดงข้อมูลล่าสุด</button></div></header>
  {error&&<div className="mon-error" role="alert">{error}</div>}{message&&<div className="mon-success">{message}</div>}
  {!loadedOnce?<section className="mon-box"><h2>กำลังเรียกข้อมูลล่าสุด</h2><p>หากข้อมูลไม่ปรากฏ โปรดดูข้อความผิดพลาดเหนือส่วนนี้</p></section>:activities.length===0?<section className="mon-box"><h2>ยังไม่มีรายการโครงการในระบบ</h2><p><b>งบประมาณ 52,744,500 บาท · เบิกจ่าย 833,463 บาท · คงเหลือ 51,911,037 บาท</b></p><p>มีข้อมูลเริ่มต้น ณ วันที่ 10 พฤศจิกายน 2569 พร้อมสำหรับนำเข้าระบบ</p><p>โปรดตรวจสอบยอดเริ่มต้นก่อนกดยืนยัน การนำเข้าข้อมูลทำได้เพียงครั้งเดียว</p><button onClick={()=>{if(window.confirm('ยืนยันนำเข้าข้อมูลโครงการและยอดเริ่มต้น ณ 10 พฤศจิกายน 2569?'))void mutate({action:'initialize'});}} disabled={busy}>นำเข้าข้อมูลโครงการ</button></section>:<>
  <div className="mon-admin-layout">
   <AdminNavigation active={section} onSelect={selectSection}/>
   <div className="mon-admin-content">
    <div className="mon-current-view mon-noprint"><span>ระบบจัดการงบประมาณ / {section==='overview'?'ภาพรวมงบประมาณ':section==='projects'?'โครงการและกิจกรรม':section==='po'?'PO / ยอดผูกพัน':section==='disbursements'?'บันทึกเบิกจ่าย':section==='history'?'ประวัติเบิกจ่าย':'ดาวน์โหลดรายงาน'}</span>
    <p>{section==='overview'?'ติดตามงบประมาณ PO และการเบิกจ่ายภาพรวม':section==='projects'?'ดูรายละเอียดโครงการและปรับปรุงกิจกรรมตามสิทธิ์':section==='po'?'เพิ่ม PO ลด PO และบันทึกจ่ายจาก PO':section==='disbursements'?'บันทึกเบิกจ่ายใหม่และปรับลดเบิกจ่าย':section==='history'?'ตรวจสอบประวัติรายการเบิกจ่ายและ PO' :'ดาวน์โหลดรายงานสำหรับใช้งานและเสนอผู้บริหาร'}</p></div>
    {(section==='overview'||section==='pdf')&&<>
    <section className="mon-box mon-filters" id="monitor-overview"><div><h2>รายงานผลการเบิกจ่าย</h2><p>เลือกช่วงเวลารายงาน โดยระบบแสดงยอดเบิกจ่ายสะสมถึงวันที่อ้างอิง</p></div><div className="mon-controls"><div className="mon-tabs">{(['daily','monthly','yearly'] as const).map(m=><button key={m} aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>setMode(m)}>{m==='daily'?'รายวัน':m==='monthly'?'รายเดือน':'รายปี'}</button>)}</div><label>วันที่อ้างอิง <input type="date" value={date} min="2026-11-10" max="2027-09-30" onChange={e=>setDate(e.target.value)}/></label></div></section>
  <div className="mon-print-title"><h2>รายงานผลการเบิกจ่ายงบประมาณจังหวัดหนองบัวลำภู ประจำปีงบประมาณ พ.ศ. 2570</h2><p>ข้อมูล ณ {thai(report.asOf)} · รายงาน{mode==='daily'?'รายวัน':mode==='monthly'?'รายเดือน':'รายปี'} ({thai(report.from)} – {thai(report.asOf)})</p></div>
  {section==='pdf'&&<><AdminCsvExport report={report} enabled={!busy&&!truncated&&activities.length>0}/><AdminPdfExport report={report} entries={entries} transfers={transfers} mode={mode} enabled={!busy&&!truncated&&activities.length>0}/></>}
  {section==='overview'&&<><section className="mon-kpis">{[{label:'งบประมาณรวม',value:report.total.budget},{label:'PO คงค้าง',value:report.total.po},{label:'ผลเบิกจ่ายสะสม ณ วันที่เลือก',value:report.total.disbursed},{label:'ยอดเบิกจ่ายสุทธิในช่วงที่เลือก',value:report.total.period},{label:'คงเหลือยังไม่เบิกจ่าย',value:report.total.remaining},{label:'วงเงินที่ยังไม่ผูกพัน',value:report.total.available}].map(k=><div className="mon-kpi" key={k.label}><span>{k.label}</span><strong>{fmt(k.value)}</strong><small>บาท</small></div>)}</section>
  <section className="mon-box"><div className="mon-justify"><h2>ความก้าวหน้าการเบิกจ่าย</h2><strong>{report.total.budget?(report.total.disbursed/report.total.budget*100).toFixed(2):'0.00'}%</strong></div><div className="mon-track"><div style={{width:Math.max(0,Math.min(100,report.total.disbursed/report.total.budget*100||0))+'%'}}/></div><p>เบิกจ่ายสะสม {fmt(report.total.disbursed)} บาท จากงบประมาณ {fmt(report.total.budget)} บาท</p>{truncated&&<p className="mon-error">มีรายการเบิกจ่ายเกิน 20,000 รายการ ระบบยังแสดงข้อมูลไม่ครบ กรุณาติดต่อผู้ดูแลระบบ</p>}<p className="mon-muted">หมายเหตุ: ข้อมูลเบิกจ่ายก่อนวันที่ 10 พฤศจิกายน 2569 แสดงเป็นยอดสะสม ไม่สามารถแยกรายวันย้อนหลังได้</p></section></>}
    </>}
  {(section==='projects'||section==='po'||section==='disbursements')&&<>
    {section==='po'&&<div className="mon-menu-instructions mon-noprint"><strong>จัดการ PO / ยอดผูกพัน</strong><p>เปิดโครงการและกิจกรรมที่ต้องการ เพื่อบันทึก PO ลด PO หรือจ่ายจาก PO</p></div>}
    {section==='disbursements'&&<div className="mon-menu-instructions mon-noprint"><strong>บันทึกเบิกจ่าย</strong><p>เลือกกิจกรรมเพื่อบันทึกยอดเบิกจ่ายจริง หรือลดยอดเมื่อมีเงินส่งคืน</p><button type="button" onClick={()=>openNew('')}>+ บันทึกเบิกจ่ายใหม่</button></div>}
    <section className="mon-box" id="monitor-activities">
      <div className="mon-projects-heading">
        <h2>{section==='po'?'เลือกกิจกรรมสำหรับบันทึก PO':section==='disbursements'?'เลือกกิจกรรมสำหรับบันทึกเบิกจ่าย':'ข้อมูลโครงการและกิจกรรมย่อย'}</h2>
        <p>{section==='projects'?'ตรวจสอบและปรับปรุงชื่อกิจกรรม หน่วยดำเนินการ และวงเงินตามเอกสารอนุมัติ':'เปิดโครงการที่ต้องการ แล้วใช้ปุ่มในแถวกิจกรรมย่อย'}</p>
      </div>
      <div className="mon-projects-toolbar mon-noprint">
        {section==='projects'&&<button type="button" className="mon-project-add" onClick={()=>createMaster()}><Plus size={19} aria-hidden="true"/> เพิ่มกิจกรรมในโครงการเดิม</button>}
        <label className="mon-project-search">
          <Search size={20} aria-hidden="true" className="mon-project-search-icon"/>
          <input className="mon-search" aria-label="ค้นหาโครงการ กิจกรรม หรือหน่วยงาน" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาโครงการ / กิจกรรม / หน่วยงาน"/>
          {search.trim()&&<button type="button" className="mon-search-clear" aria-label="ล้างคำค้นหา" title="ล้างคำค้นหา" onClick={()=>setSearch('')}><X size={17} aria-hidden="true"/></button>}
        </label>
      </div>
      {search.trim()&&<p className="mon-search-count mon-noprint" role="status">พบ {filtered.length} โครงการที่ตรงกับคำค้นหา{filtered.length===0?' — ลองใช้คำค้นหาอื่น':''}</p>}
    <p className="mon-muted">งบประมาณรวม {fmt(budgetTotal)} บาท · โปรดตรวจสอบวงเงินให้ตรงกับเอกสารอนุมัติ</p>
    {filtered.map(code=>{const group=report.rows.filter(a=>a.project_code===code);const summary={budget:group.reduce((s,a)=>s+a.budget,0),paid:group.reduce((s,a)=>s+a.cumulative,0),po:group.reduce((s,a)=>s+a.po,0),period:group.reduce((s,a)=>s+a.period,0)};
      const major=hierarchyMetadata.groups.filter(h=>h.projectCode===code);
      const childRows=new Set(major.flatMap(h=>h.children));
      const entriesWithHeaders=[...major.map(h=>({kind:'header' as const,order:h.sourceRow,header:h})),...group.map(a=>({kind:'activity' as const,order:a.source_row??99999,activity:a}))].sort((a,b)=>a.order-b.order);
      return <div key={code} className="mon-project"><button className="mon-project-toggle" onClick={()=>setSelected(selected===code?'':code)}><span><b>{code}</b> {group[0].project_name}</span><span>งบ {fmt(summary.budget)} · PO {fmt(summary.po)} · สะสม {fmt(summary.paid)} · งวดนี้ {fmt(summary.period)} {selected===code?'▴':'▾'}</span></button>{selected===code&&<><div className="mon-project-actions mon-noprint">{section==='projects'&&code!=='RESERVE'&&code!=='P11'&&!/^T[0-9]{2,3}$/.test(code)&&<><button onClick={()=>createMaster(code)}>+ เพิ่มกิจกรรมในโครงการนี้</button><button onClick={()=>{const value=window.prompt('ชื่อโครงการใหม่',group[0]?.project_name);if(value&&value.trim()&&value!==group[0]?.project_name)void mutateMaster({action:'rename-project',project_code:code,project_name:value});}}>แก้ชื่อโครงการ</button></>}</div><div className="mon-scroll"><table><thead><tr><th>กิจกรรม / หน่วยงาน</th><th>งบประมาณ</th><th>PO</th><th>เบิกจ่ายสะสม</th><th>เบิกจ่ายในงวด</th><th>คงเหลือ</th><th className="mon-noprint">จัดการ</th></tr></thead><tbody>{entriesWithHeaders.map(node=>{
      if(node.kind==='header'){
        const child=group.filter(a=>node.header.children.includes(a.source_row??-1));
        if(!child.length)return null;
        return <tr key={'h-'+node.header.sourceRow} className="mon-major-row"><td colSpan={7}><b>กิจกรรมหลัก: {node.header.title}</b><small>{child.length} กิจกรรมย่อย · งบรวม {fmt(child.reduce((v,a)=>v+a.budget,0))} บาท</small></td></tr>;
      }
      const a=node.activity;
      
      return <tr key={a.id} className={childRows.has(a.source_row??-1)?'mon-subactivity':''}><td><b>{a.name}</b><small>{a.agency}</small></td><td>{fmt(a.budget)}</td><td className="mon-po-value">{fmt(a.po)}</td><td>{fmt(a.cumulative)}</td><td>{fmt(a.period)}</td><td>{fmt(a.remaining)}</td><td className="mon-noprint"><div className="mon-row-actions">{section==='po'&&a.project_code!=='RESERVE'&&<button type="button" onClick={()=>openPo(a.id,'add')}>+ PO</button>}{section==='po'&&a.project_code!=='RESERVE'&&a.po>0&&<button type="button" onClick={()=>openPo(a.id,'release')}>ลด PO</button>}{section==='po'&&a.project_code!=='RESERVE'&&a.po>0&&<button type="button" className="mon-po-pay" onClick={()=>openPo(a.id,'pay')}>จ่ายจาก PO</button>}{section==='disbursements'&&a.project_code!=='RESERVE'&&<button onClick={()=>openNew(a.id)}>+ เบิกจ่าย</button>}{section==='disbursements'&&a.project_code!=='RESERVE'&&<button onClick={()=>openNew(a.id,'reduction')}>ลดยอดเบิกจ่าย</button>}{section==='projects'&&a.project_code!=='RESERVE'&&a.project_code!=='P11'&&!/^T[0-9]{2,3}$/.test(a.project_code)&&<button onClick={()=>editMaster(a)}>แก้ไขกิจกรรม</button>}</div></td></tr>;
    })}</tbody></table></div></>}</div>})}
  </section>
  </>}
  {masterVisible&&<AdminModal title={masterNew?'เพิ่มกิจกรรมย่อยใหม่':'แก้ไขข้อมูลกิจกรรมย่อย'} subtitle="ระบุข้อมูลตามเอกสารต้นทาง ระบบจะตรวจสอบวงเงินและยอดเบิกจ่ายก่อนบันทึก" busy={busy} onClose={()=>setMasterVisible(false)}>
    {modalError&&<div className="mon-error" role="alert">{modalError}</div>}
    <form onSubmit={e=>{e.preventDefault();const payload=masterNew?{action:'create-activity',project_code:masterProject,project_name:masterProjectName,name:masterName,agency:masterAgency,budget:Number(masterBudget)}:{action:'update-activity',id:masterId,name:masterName,agency:masterAgency,budget:Number(masterBudget)};void mutateMaster(payload);}}>
      <div className="mon-master-grid">
        <label>รหัสโครงการ <input value={masterProject} onChange={e=>setMasterProject(e.target.value.toUpperCase())} disabled={!masterNew} required placeholder="เช่น P03"/></label>
        <label>ชื่อโครงการ <input value={masterProjectName} onChange={e=>setMasterProjectName(e.target.value)} disabled={!masterNew} required placeholder="ชื่อโครงการ"/></label>
        <label className="mon-wide">ชื่อกิจกรรมหรือกิจกรรมย่อย <input value={masterName} onChange={e=>setMasterName(e.target.value)} required maxLength={500}/></label>
        <label>หน่วยดำเนินการ <input value={masterAgency} onChange={e=>setMasterAgency(e.target.value)} maxLength={180} placeholder="หน่วยงาน"/></label>
        <label>วงเงินงบประมาณ (บาท) <input type="number" min="0" step="0.01" value={masterBudget} onChange={e=>setMasterBudget(e.target.value)} required/></label>
      </div>
      {masterCurrent&&<p className="mon-muted">เบิกจ่ายสะสมก่อนเริ่มใช้ระบบ {fmt(masterCurrent.baseline_disbursed)} บาท · วงเงินใหม่ต้องไม่น้อยกว่ายอดเบิกจ่ายรวม</p>}
      <div className="mon-actions mon-modal-actions"><button type="submit" disabled={busy||!masterName.trim()||!masterBudget}>{busy?'กำลังบันทึก...':masterNew?'เพิ่มกิจกรรม':'บันทึกการแก้ไขกิจกรรม'}</button>
      <button type="button" disabled={busy} onClick={()=>setMasterVisible(false)}>ยกเลิก</button>
      {!masterNew&&masterCurrent&&masterCurrent.baseline_disbursed===0&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('ยืนยันลบกิจกรรมนี้? หากมียอดเบิกจ่าย ระบบจะป้องกันการลบ'))void mutateMaster({action:'delete-activity',id:masterId});}}>ลบกิจกรรมที่ไม่มีประวัติ</button>}</div>
    </form>
  </AdminModal>}
  {poVisible&&<AdminModal title={poKind==='add'?'เพิ่ม PO / ยอดผูกพัน':poKind==='release'?'ลดหรือยกเลิก PO':'จ่ายเงินจาก PO'}
   subtitle={poKind==='pay'?'ระบบลด PO และเพิ่มยอดเบิกจ่ายจริงพร้อมกันในรายการเดียว':'PO คือยอดผูกพันตามสัญญา ไม่ใช่ยอดเบิกจ่ายจริง'}
   busy={busy} onClose={()=>setPoVisible(false)}>
    {modalError&&<div className="mon-error" role="alert">{modalError}</div>}
    <form onSubmit={event=>{event.preventDefault();if(poKind==='pay'&&!window.confirm('ยืนยันจ่ายเงินจาก PO? ระบบจะลด PO และเพิ่มยอดเบิกจ่ายเท่ากัน'))return;void submitPo();}}>
      <div className="mon-master-grid">
        <label className="mon-wide">กิจกรรมย่อย
          <select value={poActivityId} disabled><option value={poActivityId}>{activities.find(a=>a.id===poActivityId)?.name??poActivityId}</option></select>
        </label>
        <label>วันที่รายการ <input type="date" min="2026-11-10" max="2027-09-30" required value={poDate} onChange={event=>setPoDate(event.target.value)}/></label>
        <label>จำนวนเงิน (บาท) <input type="number" min="0.01" step="0.01" required value={poAmount} onChange={event=>setPoAmount(event.target.value)}/></label>
        <label className="mon-wide">เลขที่ PO / สัญญา / เอกสารอ้างอิง
          <input value={poReference} maxLength={300} onChange={event=>setPoReference(event.target.value)} placeholder="เลขที่สัญญาหรือเอกสารอ้างอิง"/>
        </label>
        <label className="mon-wide">รายละเอียด / เหตุผล
          <input value={poNote} maxLength={1000} onChange={event=>setPoNote(event.target.value)} placeholder="ผู้รับจ้าง รายการงาน หรือเหตุผลการลด PO"/>
        </label>
      </div>
      <p className="mon-muted">ยอด PO คงค้างของกิจกรรม ณ วันที่เลือกในรายงาน: {fmt(report.rows.find(a=>a.id===poActivityId)?.po??0)} บาท</p>
      <div className="mon-actions mon-modal-actions">
        <button disabled={busy||!poAmount||(!poReference.trim()&&!poNote.trim())} type="submit">
          {busy?'กำลังบันทึก...':poKind==='pay'?'ยืนยันจ่ายจาก PO':poKind==='release'?'ยืนยันลด PO':'บันทึก PO'}
        </button>
        <button type="button" disabled={busy} onClick={()=>setPoVisible(false)}>ยกเลิก</button>
      </div>
    </form>
  </AdminModal>}
  {entryVisible&&<AdminModal title={entryId?'แก้ไขรายการเบิกจ่าย':entryKind==='reduction'?'ลดยอดเบิกจ่าย':'บันทึกผลเบิกจ่ายครั้งใหม่'} subtitle="บันทึกยอดเบิกจ่ายที่มีหลักฐานยืนยันแล้ว ตามวันที่เบิกจ่ายจริง ระบบคำนวณยอดสะสมและคงเหลือให้" busy={busy} onClose={()=>setEntryVisible(false)}>
    {modalError&&<div className="mon-error" role="alert">{modalError}</div>}
    <form onSubmit={e=>{e.preventDefault();void mutate({action:'save-entry',id:entryId||undefined,activity_id:activityId,paid_on:paidOn,amount:Number(amount),kind:entryKind,reference,note});}}>
      <div className="mon-form"><label>ประเภทรายการ<select value={entryKind} onChange={e=>setEntryKind(e.target.value as 'disbursement'|'reduction')}><option value="disbursement">เบิกจ่ายเพิ่ม</option><option value="reduction">ลดยอดเบิกจ่าย</option></select></label><label>กิจกรรมย่อย<select value={activityId} onChange={e=>setActivityId(e.target.value)} required><option value="">เลือกกิจกรรม</option>{activities.filter(a=>a.project_code!=='RESERVE').map(a=><option value={a.id} key={a.id}>{a.project_code} · {a.name.slice(0,110)}</option>)}</select></label><label>{entryKind==='reduction'?'วันที่ลดยอดเบิกจ่าย':'วันที่เบิกจ่าย'}<input type="date" value={paidOn} min="2026-11-10" max="2027-09-30" onChange={e=>setPaidOn(e.target.value)} required/></label><label>{entryKind==='reduction'?'จำนวนเงินที่ลดยอด (บาท)':'จำนวนเงินที่เบิกเพิ่ม (บาท)'}<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required placeholder="เช่น 25000"/></label><label>เอกสารอ้างอิง<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="เลขที่ฎีกา / หนังสือ"/></label><label className="mon-wide">หมายเหตุ<input value={note} onChange={e=>setNote(e.target.value)} placeholder={entryKind==='reduction'?'ระบุเหตุผลและหลักฐานการลดยอด':'รายละเอียดการเบิกจ่าย'}/></label></div>
      <div className="mon-actions mon-modal-actions"><button type="submit" disabled={busy||!activityId||(entryKind==='reduction'&&!note.trim()&&!reference.trim())}>{busy?'กำลังบันทึก...':entryId?'บันทึกการแก้ไข':entryKind==='reduction'?'ยืนยันลดยอดเบิกจ่าย':'เพิ่มรายการเบิกจ่าย'}</button><button type="button" disabled={busy} onClick={()=>setEntryVisible(false)}>ยกเลิก</button></div>
    </form>
  </AdminModal>}
  {(section==='po'||section==='history')&&<section className="mon-box mon-noprint mon-entries-history">
   <h2>ประวัติ PO / ยอดผูกพัน</h2>
   <p>ตรวจสอบรายการยอดผูกพันและเอกสารอ้างอิง</p>
   <div className="mon-scroll"><table><thead><tr><th>วันที่</th><th>กิจกรรมย่อย</th><th>รายการ</th><th>ยอดเคลื่อนไหว PO</th><th>เลขที่สัญญา / เอกสาร</th></tr></thead>
   <tbody>{poEntries.slice(0,150).map(item=><tr key={item.id}>
     <td>{thai(item.po_on)}</td>
     <td>{activities.find(a=>a.id===item.activity_id)?.name??item.activity_id}</td>
     <td>{item.kind==='add'?'เพิ่ม PO':item.kind==='pay'?'จ่ายจาก PO':'ลด PO'}</td>
     <td>{item.amount<0?'−':'+'}{fmt(Math.abs(item.amount))}</td>
     <td>{item.reference}{item.note&&<small>{item.note}</small>}</td>
   </tr>)}</tbody></table></div>
  </section>}
  {section==='history'&&<section className="mon-box mon-noprint mon-entries-history" id="monitor-history"><h2>ประวัติรายการเบิกจ่าย</h2><p>วันที่มีรายการจริงจะแสดงอัตโนมัติ ไม่จำเป็นต้องจำวันที่เอง</p><div className="mon-history">{history.slice(0,20).map(d=><button key={d} onClick={()=>{setDate(d);setMode('daily');}}>{thai(d)} ({entries.filter(e=>e.paid_on===d).length} รายการ)</button>)}</div><div className="mon-scroll"><table><thead><tr><th>วันที่</th><th>กิจกรรมย่อย</th><th>ประเภท / ยอดเคลื่อนไหว</th><th>เอกสารอ้างอิง</th><th>จัดการ</th></tr></thead><tbody>{entries.filter(e=>search?activities.find(a=>a.id===e.activity_id)?.name.includes(search):true).slice(0,150).map(e=><tr key={e.id}><td>{thai(e.paid_on)}</td><td>{activities.find(a=>a.id===e.activity_id)?.name??e.activity_id}</td><td>{e.amount<0?'ลดยอดเบิกจ่าย':'เบิกจ่ายเพิ่ม'} · {e.amount<0?'−':''}{fmt(Math.abs(e.amount))}</td><td>{e.reference}</td><td><button onClick={()=>editEntry(e)}>แก้ไข</button> <button onClick={()=>{if(window.confirm('ยืนยันลบรายการนี้? ระบบเก็บประวัติการลบไว้'))void mutate({action:'delete-entry',id:e.id});}}>ลบ</button></td></tr>)}</tbody></table></div></section>}
   </div>
  </div>
  </>}
  <footer className="mon-footer">ข้อมูลจากระบบบันทึกการเบิกจ่ายของจังหวัด · รายงานฉบับภายในสำหรับตรวจสอบก่อนเสนอผู้บริหาร</footer>
 </main>;
}
