'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode,type KeyboardEvent} from 'react';
import Link from 'next/link';
import {createClient} from '@supabase/supabase-js';
import {bounds,fmt,reportRows,type MonitorActivity,type MonitorEntry,type MonitorPeriod} from '@/lib/monitor';
import hierarchyMetadata from '@/data/hierarchy-metadata.json';
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
 const [activities,setActivities]=useState<MonitorActivity[]>([]),[entries,setEntries]=useState<MonitorEntry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[truncated,setTruncated]=useState(false);
 const [mode,setMode]=useState<MonitorPeriod>('daily'),[date,setDate]=useState(today),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const [entryId,setEntryId]=useState(''),[activityId,setActivityId]=useState(''),[amount,setAmount]=useState(''),[paidOn,setPaidOn]=useState(today),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const [entryVisible,setEntryVisible]=useState(false),[modalError,setModalError]=useState('');
 const [masterVisible,setMasterVisible]=useState(false),[masterNew,setMasterNew]=useState(false),[masterId,setMasterId]=useState(''),[masterProject,setMasterProject]=useState(''),[masterProjectName,setMasterProjectName]=useState(''),[masterName,setMasterName]=useState(''),[masterAgency,setMasterAgency]=useState(''),[masterBudget,setMasterBudget]=useState(''),[projectEdit,setProjectEdit]=useState('');
 const [section,setSection]=useState<'overview'|'activities'|'entries'>('overview');
 const getToken=useCallback(async()=>{if(!client)throw Error('ยังไม่ได้เชื่อม Supabase');const {data}=await client.auth.getSession();if(!data.session)throw Error('กรุณาเข้าสู่ระบบใหม่');return data.session.access_token;},[client]);
 const refresh=useCallback(async()=>{setBusy(true);setError('');try{const token=await getToken();const res=await fetch('/api/admin/monitor',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const json=await res.json();if(!res.ok)throw Error(json.error||'ไม่สามารถอ่านข้อมูลได้');setActivities(json.activities);setEntries(json.entries);setLoadedOnce(true);setTruncated(!!json.truncated);}catch(e){setError(e instanceof Error?e.message:'อ่านข้อมูลไม่สำเร็จ');}finally{setBusy(false);}},[getToken]);
 useEffect(()=>{if(!client){setReady(true);return;}client.auth.getSession().then(({data})=>{setSession(data.session?.access_token??null);setReady(true);});const {data:{subscription}}=client.auth.onAuthStateChange((_e,s)=>setSession(s?.access_token??null));return()=>subscription.unsubscribe();},[client]);
 useEffect(()=>{if(session)void refresh();},[Boolean(session),refresh]);
 const report=useMemo(()=>reportRows(activities,entries,mode,date),[activities,entries,mode,date]);
 const projectCodes=useMemo(()=>[...new Set(report.rows.map(a=>a.project_code))],[report]);
 const filtered=projectCodes.filter(p=>report.rows.some(a=>a.project_code===p&&(a.project_name+a.name+a.agency).toLowerCase().includes(search.toLowerCase())));
 const history=[...new Set(entries.map(e=>e.paid_on))].sort().reverse();
 const baseline='2026-11-10';
 const budgetTotal=activities.reduce((sum,a)=>sum+Number(a.budget),0);
 const masterCurrent=activities.find(a=>a.id===masterId);
 function editMaster(a:MonitorActivity){
   setMasterVisible(true);setMasterNew(false);setMasterId(a.id);setMasterProject(a.project_code);setMasterProjectName(a.project_name);
   setMasterName(a.name);setMasterAgency(a.agency);setMasterBudget(String(a.budget));
   setModalError('');setSection('activities');setSelected(a.project_code);
 }
 function createMaster(projectCode=''){
   setMasterVisible(true);setMasterNew(true);setMasterId('');setMasterProject(projectCode);
   setMasterProjectName(activities.find(a=>a.project_code===projectCode)?.project_name??'');
   setMasterName('');setMasterAgency('');setMasterBudget('');
   setModalError('');setSection('activities');
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

 async function mutate(payload:Record<string,unknown>){setBusy(true);setError('');setModalError('');setMessage('');try{const res=await fetch('/api/admin/monitor',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`},body:JSON.stringify(payload)});const x=await res.json();if(!res.ok)throw Error(x.error||'บันทึกไม่สำเร็จ');await refresh();setMessage(payload.action==='initialize'?'นำเข้าข้อมูลกิจกรรมตั้งต้นสำเร็จ':payload.action==='delete-entry'?'ลบรายการแล้ว':'บันทึกการเบิกจ่ายสำเร็จ');if(payload.action==='save-entry')setEntryVisible(false);setEntryId('');setAmount('');setReference('');setNote('');}catch(e){const msg=e instanceof Error?e.message:'ดำเนินการไม่สำเร็จ';if(payload.action==='save-entry')setModalError(msg);else setError(msg);}finally{setBusy(false);}}
 function editEntry(e:MonitorEntry){setEntryId(e.id);setActivityId(e.activity_id);setPaidOn(e.paid_on);setAmount(String(e.amount));setReference(e.reference);setNote(e.note);setModalError('');setEntryVisible(true);}
 function openNew(id:string){setActivityId(id);setPaidOn(today());setEntryId('');setAmount('');setReference('');setNote('');setModalError('');setEntryVisible(true);}
 function forPeriod(e:MonitorEntry){return e.paid_on>=report.from&&e.paid_on<=report.to;}
 if(!ready)return <main className="mon-wrap">กำลังตรวจสอบสิทธิ์...</main>;
 if(!session)return <main className="mon-wrap mon-login"><h1>ระบบจัดการข้อมูลการเบิกจ่ายงบประมาณ</h1><p className="mon-release-label">ระบบสำหรับเจ้าหน้าที่</p><p>เข้าสู่ระบบเจ้าหน้าที่เพียงครั้งเดียว เพื่อดูรายงานและบันทึกยอดเบิกจ่ายรายกิจกรรมย่อย</p><form className="mon-box mon-login-card" onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{if(!client)throw Error('ยังไม่ตั้งค่า Supabase');const r=await client.auth.signInWithPassword({email:loginEmail,password:loginPass});if(r.error)throw r.error;}catch(ex){setError(ex instanceof Error?ex.message:'เข้าสู่ระบบไม่สำเร็จ');}finally{setBusy(false)}}}><label>อีเมล<input type="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}/></label><label>รหัสผ่าน<input type="password" required value={loginPass} onChange={e=>setLoginPass(e.target.value)}/></label>{error&&<p className="mon-error">{error}</p>}<button className="mon-login-submit" disabled={busy}>เข้าสู่ระบบ</button></form></main>;
 return <main className="mon-wrap">
  <header className="mon-header"><div><Link href="/">← กลับสู่หน้ารายงานสาธารณะ</Link><h1>ศูนย์รายงานผลการเบิกจ่าย</h1><p className="mon-release-label">บันทึกและตรวจสอบข้อมูลภายใน</p><p>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570 · ใช้ยอดเบิกจ่ายรายกิจกรรมย่อยเป็นหลัก</p></div><div className="mon-actions"><button onClick={async()=>{await client?.auth.signOut();setSession(null);}}>ออกจากระบบ</button><button onClick={()=>void refresh()} disabled={busy}>แสดงข้อมูลล่าสุด</button><button onClick={()=>window.print()}>พิมพ์รายงานภายใน</button></div></header>
  {error&&<div className="mon-error" role="alert">{error}</div>}{message&&<div className="mon-success">{message}</div>}
  {!loadedOnce?<section className="mon-box"><h2>กำลังเรียกข้อมูลล่าสุด</h2><p>หากข้อมูลไม่ปรากฏ โปรดดูข้อความผิดพลาดเหนือส่วนนี้</p></section>:activities.length===0?<section className="mon-box"><h2>ข้อมูลล่าสุดจาก Excel พร้อมนำเข้าแล้ว</h2><p><b>งบประมาณ 52,744,500 บาท · เบิกจ่าย 833,463 บาท · คงเหลือ 51,911,037 บาท</b></p><p>ข้อมูลอ้างอิง ณ 10 พ.ย. 2569 — กดปุ่มด้านล่างครั้งเดียว เพื่อเริ่มบันทึกผลเบิกจ่ายในกิจกรรมย่อย</p><p>ระบบจะนำเข้าโครงสร้างโครงการและกิจกรรมย่อยจากไฟล์วันที่ 10 พฤศจิกายน 2569 เพียงครั้งเดียว โดยเก็บยอดเบิกจ่าย 833,463 บาทเป็นยอดตั้งต้น จากนั้นบันทึกเฉพาะรายการเบิกเพิ่ม</p><button onClick={()=>{if(window.confirm('นำเข้าข้อมูลตั้งต้น 10 พ.ย. 2569 เพียงครั้งเดียว?'))void mutate({action:'initialize'});}} disabled={busy}>นำเข้ารายการโครงการและกิจกรรมย่อย</button><p className="mon-muted">คำเตือน: สำหรับการรายงานก่อนวันที่ 10 พฤศจิกายน 2569 จำเป็นต้องมีข้อมูลย้อนหลังจากเอกสารก่อนหน้านี้</p></section>:<>
  <nav className="mon-section-tabs mon-noprint" aria-label="เมนูจัดการข้อมูล">
    <button className={section==='overview'?'active':''} onClick={()=>{setSection('overview');document.getElementById('monitor-overview')?.scrollIntoView({behavior:'smooth'});}}>ภาพรวมรายงาน</button>
    <button className={section==='activities'?'active':''} onClick={()=>{setSection('activities');document.getElementById('monitor-activities')?.scrollIntoView({behavior:'smooth'});}}>โครงการและกิจกรรมย่อย</button>
    <button className={section==='entries'?'active':''} onClick={()=>{setSection('entries');openNew('');}}>บันทึกยอดเบิกจ่าย</button>
  </nav>
  <section className="mon-box mon-filters" id="monitor-overview"><div><h2>รายงานผลการเบิกจ่าย</h2><p>เลือกช่วงเวลารายงาน โดยระบบแสดงยอดเบิกจ่ายสะสมถึงวันที่อ้างอิง</p></div><div className="mon-controls"><div className="mon-tabs">{(['daily','monthly','yearly'] as const).map(m=><button key={m} aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>setMode(m)}>{m==='daily'?'รายวัน':m==='monthly'?'รายเดือน':'รายปี'}</button>)}</div><label>วันที่อ้างอิง <input type="date" value={date} min="2026-11-10" max="2027-09-30" onChange={e=>setDate(e.target.value)}/></label></div></section>
  <div className="mon-print-title"><h2>รายงานผลการเบิกจ่ายงบประมาณจังหวัดหนองบัวลำภู ประจำปีงบประมาณ พ.ศ. 2570</h2><p>ข้อมูล ณ {thai(report.asOf)} · รายงาน{mode==='daily'?'รายวัน':mode==='monthly'?'รายเดือน':'รายปี'} ({thai(report.from)} – {thai(report.asOf)})</p></div>
  <section className="mon-kpis">{[{label:'งบประมาณรวม',value:report.total.budget},{label:'ผลเบิกจ่ายสะสม ณ วันที่เลือก',value:report.total.disbursed},{label:'เบิกจ่ายเพิ่มในช่วงที่เลือก',value:report.total.period},{label:'คงเหลือยังไม่เบิกจ่าย',value:report.total.remaining}].map(k=><div className="mon-kpi" key={k.label}><span>{k.label}</span><strong>{fmt(k.value)}</strong><small>บาท</small></div>)}</section>
  <section className="mon-box"><div className="mon-justify"><h2>ความก้าวหน้าการเบิกจ่าย</h2><strong>{report.total.budget?(report.total.disbursed/report.total.budget*100).toFixed(2):'0.00'}%</strong></div><div className="mon-track"><div style={{width:Math.max(0,Math.min(100,report.total.disbursed/report.total.budget*100||0))+'%'}}/></div><p>เบิกจ่ายสะสม {fmt(report.total.disbursed)} บาท จากงบประมาณ {fmt(report.total.budget)} บาท</p>{truncated&&<p className="mon-error">มีรายการเบิกจ่ายเกิน 20,000 รายการ ระบบยังแสดงข้อมูลไม่ครบ กรุณาติดต่อผู้ดูแลระบบ</p>}<p className="mon-muted">ยอดตั้งต้น ณ 10 พฤศจิกายน 2569 เป็นยอดเบิกจ่ายสะสมก่อนเริ่มใช้ระบบ จึงยังไม่สามารถแจกแจงเป็นรายวันหรือรายเดือนย้อนหลังได้ ช่องเบิกจ่ายเพิ่มในช่วงที่เลือกนับเฉพาะรายการที่บันทึกภายหลังเท่านั้น</p></section>
  <section className="mon-box" id="monitor-activities"><div className="mon-justify"><div><h2>ข้อมูลโครงการและกิจกรรมย่อย</h2><p>ตรวจสอบ เพิ่มหรือแก้ไขข้อมูล ชื่อกิจกรรม หน่วยดำเนินการ และวงเงินตามเอกสารที่ได้รับอนุมัติ</p></div><div className="mon-master-actions mon-noprint"><button onClick={()=>createMaster()}>+ เพิ่มกิจกรรม/โครงการ</button><input className="mon-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาโครงการ / กิจกรรม / หน่วยงาน"/></div></div>
    <p className="mon-muted">วงเงินรวมปัจจุบัน {fmt(budgetTotal)} บาท · กรุณาตรวจสอบรายการเปลี่ยนแปลงวงเงินให้ตรงกับเอกสารที่ได้รับอนุมัติ</p>
    {filtered.map(code=>{const group=report.rows.filter(a=>a.project_code===code);const summary={budget:group.reduce((s,a)=>s+a.budget,0),paid:group.reduce((s,a)=>s+a.cumulative,0),period:group.reduce((s,a)=>s+a.period,0)};
      const major=hierarchyMetadata.groups.filter(h=>h.projectCode===code);
      const childRows=new Set(major.flatMap(h=>h.children));
      const entriesWithHeaders=[...major.map(h=>({kind:'header' as const,order:h.sourceRow,header:h})),...group.map(a=>({kind:'activity' as const,order:a.source_row??99999,activity:a}))].sort((a,b)=>a.order-b.order);
      return <div key={code} className="mon-project"><button className="mon-project-toggle" onClick={()=>setSelected(selected===code?'':code)}><span><b>{code}</b> {group[0].project_name}</span><span>งบ {fmt(summary.budget)} · สะสม {fmt(summary.paid)} · งวดนี้ {fmt(summary.period)} {selected===code?'▴':'▾'}</span></button>{selected===code&&<><div className="mon-project-actions mon-noprint">{code!=='RESERVE'&&<><button onClick={()=>createMaster(code)}>+ เพิ่มกิจกรรมในโครงการนี้</button><button onClick={()=>{const value=window.prompt('ชื่อโครงการใหม่',group[0]?.project_name);if(value&&value.trim()&&value!==group[0]?.project_name)void mutateMaster({action:'rename-project',project_code:code,project_name:value});}}>แก้ชื่อโครงการ</button></>}</div><div className="mon-scroll"><table><thead><tr><th>กิจกรรม / หน่วยงาน</th><th>งบประมาณ</th><th>เบิกจ่ายสะสม</th><th>เบิกจ่ายในงวด</th><th>คงเหลือ</th><th className="mon-noprint">จัดการ</th></tr></thead><tbody>{entriesWithHeaders.map(node=>{
      if(node.kind==='header'){
        const child=group.filter(a=>node.header.children.includes(a.source_row??-1));
        if(!child.length)return null;
        return <tr key={'h-'+node.header.sourceRow} className="mon-major-row"><td colSpan={6}><b>กิจกรรมหลัก: {node.header.title}</b><small>{child.length} กิจกรรมย่อย · งบรวม {fmt(child.reduce((v,a)=>v+a.budget,0))} บาท (แสดงเป็นหัวข้อ ไม่บวกงบซ้ำ)</small></td></tr>;
      }
      const a=node.activity;
      const agencyRef=hierarchyMetadata.sourceByRow[String(a.source_row??'') as keyof typeof hierarchyMetadata.sourceByRow];
      return <tr key={a.id} className={childRows.has(a.source_row??-1)?'mon-subactivity':''}><td><b>{a.name}</b><small>{a.agency}</small>{agencyRef&&<small>อ้างอิงชีต {agencyRef.sheet} แถว {agencyRef.agencyRow}</small>}</td><td>{fmt(a.budget)}</td><td>{fmt(a.cumulative)}</td><td>{fmt(a.period)}</td><td>{fmt(a.remaining)}</td><td className="mon-noprint"><div className="mon-row-actions">{a.project_code!=='RESERVE'&&<button onClick={()=>openNew(a.id)}>+ เบิกจ่าย</button>}{a.project_code!=='RESERVE'&&<button onClick={()=>editMaster(a)}>แก้ไขกิจกรรม</button>}</div></td></tr>;
    })}</tbody></table></div></>}</div>})}
  </section>
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
      {masterCurrent&&<p className="mon-muted">ยอดเบิกจ่ายตั้งต้นของรายการนี้ {fmt(masterCurrent.baseline_disbursed)} บาท · ระบบไม่อนุญาตให้ลดวงเงินต่ำกว่ายอดเบิกสะสม</p>}
      <div className="mon-actions mon-modal-actions"><button type="submit" disabled={busy||!masterName.trim()||!masterBudget}>{busy?'กำลังบันทึก...':masterNew?'เพิ่มกิจกรรม':'บันทึกการแก้ไขกิจกรรม'}</button>
      <button type="button" disabled={busy} onClick={()=>setMasterVisible(false)}>ยกเลิก</button>
      {!masterNew&&masterCurrent&&masterCurrent.baseline_disbursed===0&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('ยืนยันลบกิจกรรมนี้? หากมียอดเบิกจ่าย ระบบจะป้องกันการลบ'))void mutateMaster({action:'delete-activity',id:masterId});}}>ลบกิจกรรมที่ไม่มีประวัติ</button>}</div>
    </form>
  </AdminModal>}
  {entryVisible&&<AdminModal title={entryId?'แก้ไขรายการเบิกจ่าย':'บันทึกผลเบิกจ่ายครั้งใหม่'} subtitle="บันทึกยอดเบิกจ่ายที่มีหลักฐานยืนยันแล้ว ตามวันที่เบิกจ่ายจริง ระบบคำนวณยอดสะสมและคงเหลือให้" busy={busy} onClose={()=>setEntryVisible(false)}>
    {modalError&&<div className="mon-error" role="alert">{modalError}</div>}
    <form onSubmit={e=>{e.preventDefault();void mutate({action:'save-entry',id:entryId||undefined,activity_id:activityId,paid_on:paidOn,amount:Number(amount),reference,note});}}>
      <div className="mon-form"><label>กิจกรรมย่อย<select value={activityId} onChange={e=>setActivityId(e.target.value)} required><option value="">เลือกกิจกรรม</option>{activities.filter(a=>a.project_code!=='RESERVE').map(a=><option value={a.id} key={a.id}>{a.project_code} · {a.name.slice(0,110)}</option>)}</select></label><label>วันที่เบิกจ่าย<input type="date" value={paidOn} min="2026-11-10" max="2027-09-30" onChange={e=>setPaidOn(e.target.value)} required/></label><label>จำนวนเงินที่เบิกเพิ่ม (บาท)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required placeholder="เช่น 25000"/></label><label>เอกสารอ้างอิง<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="เลขที่ฎีกา / หนังสือ"/></label><label className="mon-wide">หมายเหตุ<input value={note} onChange={e=>setNote(e.target.value)} placeholder="รายละเอียดการเบิกจ่าย"/></label></div>
      <div className="mon-actions mon-modal-actions"><button type="submit" disabled={busy||!activityId}>{busy?'กำลังบันทึก...':entryId?'บันทึกการแก้ไข':'เพิ่มรายการเบิกจ่าย'}</button><button type="button" disabled={busy} onClick={()=>setEntryVisible(false)}>ยกเลิก</button></div>
    </form>
  </AdminModal>}
  <section className="mon-box mon-noprint mon-entries-history" id="monitor-history"><h2>ประวัติรายการเบิกจ่าย</h2><p>วันที่มีรายการจริงจะแสดงอัตโนมัติ ไม่จำเป็นต้องจำวันที่เอง</p><div className="mon-history">{history.slice(0,20).map(d=><button key={d} onClick={()=>{setDate(d);setMode('daily');}}>{thai(d)} ({entries.filter(e=>e.paid_on===d).length} รายการ)</button>)}</div><div className="mon-scroll"><table><thead><tr><th>วันที่</th><th>กิจกรรมย่อย</th><th>ยอดที่เบิกเพิ่ม</th><th>เอกสารอ้างอิง</th><th>จัดการ</th></tr></thead><tbody>{entries.filter(e=>search?activities.find(a=>a.id===e.activity_id)?.name.includes(search):true).slice(0,150).map(e=><tr key={e.id}><td>{thai(e.paid_on)}</td><td>{activities.find(a=>a.id===e.activity_id)?.name??e.activity_id}</td><td>{fmt(e.amount)}</td><td>{e.reference}</td><td><button onClick={()=>editEntry(e)}>แก้ไข</button> <button onClick={()=>{if(window.confirm('ยืนยันลบรายการนี้? ระบบเก็บประวัติการลบไว้'))void mutate({action:'delete-entry',id:e.id});}}>ลบ</button></td></tr>)}</tbody></table></div></section>
  </>}
  <footer className="mon-footer">ข้อมูลจากระบบบันทึกการเบิกจ่ายของจังหวัด · รายงานฉบับภายในสำหรับตรวจสอบก่อนเสนอผู้บริหาร</footer>
 </main>;
}
