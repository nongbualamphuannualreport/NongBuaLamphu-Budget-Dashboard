'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {AdminNavigation} from '@/components/AdminNavigation';
import {createClient} from '@supabase/supabase-js';
import type {MonitorActivity,MonitorEntry} from '@/lib/monitor';
import type {MonitorPoEntry} from '@/lib/po';
import {TransferActivityManager} from '@/components/TransferActivityManager';
import type {ReallocationTransfer} from '@/lib/reallocation';
import {fmt} from '@/lib/monitor';
import './reserve-admin.css';
const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
const thai=(s:string)=>new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(s+'T12:00:00+07:00'));
export default function ReserveAdmin(){
 const client=useMemo(()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;return url&&key?createClient(url,key):null},[]);
 const [session,setSession]=useState(false),[ready,setReady]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [activities,setActivities]=useState<MonitorActivity[]>([]),[transfers,setTransfers]=useState<ReallocationTransfer[]>([]);
 const [entries,setEntries]=useState<MonitorEntry[]>([]),[poEntries,setPoEntries]=useState<MonitorPoEntry[]>([]);
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [target,setTarget]=useState(''),[projectName,setProjectName]=useState(''),[activityName,setActivityName]=useState(''),[agency,setAgency]=useState('');
 const [amount,setAmount]=useState(''),[date,setDate]=useState(today),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const [allocationOpen,setAllocationOpen]=useState(false);
 const allocationDialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!allocationOpen)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';allocationDialog.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.preventDefault();setAllocationOpen(false);}if(e.key==='Tab'){const nodes=Array.from(allocationDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')??[]);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',key);previous?.focus();};},[allocationOpen,busy]);
 const [cancelTarget,setCancelTarget]=useState(''),[cancelDate,setCancelDate]=useState(today),[cancelReason,setCancelReason]=useState('');
 const getToken=useCallback(async()=>{if(!client)throw Error('ไม่พบการตั้งค่า Supabase');const {data}=await client.auth.getSession();if(!data.session)throw Error('กรุณาเข้าสู่ระบบก่อน');return data.session.access_token;},[client]);
 const reload=useCallback(async()=>{
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/admin/monitor',{cache:'no-store',headers:{Authorization:'Bearer '+await getToken()}});
   const j=await res.json();if(!res.ok)throw Error(j.error||'ไม่สามารถโหลดข้อมูล');
   setActivities(j.activities??[]);setTransfers(j.transfers??[]);setEntries(j.entries??[]);setPoEntries(j.poEntries??[]);setLoaded(true);
  }catch(e){setError(e instanceof Error?e.message:'อ่านข้อมูลไม่สำเร็จ');}finally{setBusy(false);}
 },[getToken]);
 useEffect(()=>{if(!client){setReady(true);return;}void client.auth.getSession().then(x=>{setSession(!!x.data.session);setReady(true)});
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,s)=>setSession(!!s));return()=>subscription.unsubscribe();
 },[client]);
 useEffect(()=>{if(session)void reload();},[session,reload]);
 const source=Number(activities.find(a=>a.project_code==='RESERVE')?.budget??0);
 const active=transfers.filter(t=>!t.cancelled_on);
 const allocated=active.reduce((v,t)=>v+Number(t.amount),0);
 const remaining=Math.round((source-allocated)*100)/100;
 const usedCodes=[...new Set(active.map(t=>t.project_code))].sort();
 const [expandedProject,setExpandedProject]=useState('');
 const usedActivityIds=new Set(active.map(t=>t.activity_id));
 const transferredActivities=activities.filter(a=>usedActivityIds.has(a.id));
 const activeByProject=[...new Set(active.map(t=>t.project_code))].sort().map(code=>({code,name:active.find(t=>t.project_code===code)?.project_name??code,allocations:active.filter(t=>t.project_code===code)}));
 async function send(payload:Record<string,unknown>){
  setBusy(true);setError('');setSuccess('');
  try{
   const res=await fetch('/api/admin/reallocation',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await getToken()},body:JSON.stringify(payload)});
   const j=await res.json();if(!res.ok)throw Error(j.error??'ทำรายการไม่สำเร็จ');
   await reload();if(payload.action==='allocate')setAllocationOpen(false);setSuccess(payload.action==='cancel'?'ยกเลิกการจัดสรรและคืนยอดกลับกองเงินแล้ว':'จัดสรรเงินและเพิ่มโครงการ/กิจกรรมใหม่เรียบร้อยแล้ว');
   setAmount('');setReference('');setNote('');setActivityName('');setCancelReason('');setCancelTarget('');
  }catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ');}finally{setBusy(false);}
 }
 return <main className="ra-shell">
  <header className="ra-head ra-unified-head">
    <div className="ra-head-title">
      <Link className="ra-back-public" href="/">← กลับสู่หน้ารายงานสาธารณะ</Link>
      <h1>ศูนย์รายงานผลการเบิกจ่าย</h1>
      <p className="ra-internal-badge">บันทึกและตรวจสอบข้อมูลภายใน</p>
      <p>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570 · ใช้ยอดเบิกจ่ายรายกิจกรรมย่อยเป็นหลัก</p>
    </div>
    {session&&<div className="ra-head-actions">
      <button type="button" onClick={async()=>{await client?.auth.signOut();setSession(false);setLoaded(false);}}>ออกจากระบบ</button>
      <button type="button" onClick={()=>void reload()} disabled={busy}>แสดงข้อมูลล่าสุด</button>
    </div>}
  </header>
  <div className={"ra-admin-layout"+(!session?" ra-admin-layout-login":"")}>
    {session&&<AdminNavigation active="reserve"/>}
    <div className="ra-admin-main">
  {session&&<div className="ra-current-view"><strong>ระบบจัดการงบประมาณ / เงินโอนเปลี่ยนแปลง</strong><p>จัดสรรเงินและติดตามผลการใช้จ่าย</p></div>}
  {!ready?<p>กำลังตรวจสอบสิทธิ์...</p>:!session?<section className="ra-card"><h2>เข้าสู่ระบบเจ้าหน้าที่</h2><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{if(!client)throw Error('ไม่สามารถเชื่อมต่อระบบข้อมูลได้ กรุณาติดต่อผู้ดูแล');const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;}catch(e){setError(e instanceof Error?e.message:'เข้าสู่ระบบไม่สำเร็จ');}finally{setBusy(false);}}}><label>อีเมล<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>รหัสผ่าน<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>เข้าสู่ระบบ</button></form></section>:
  <>
   {error&&<p className="ra-error" role="alert">{error}</p>}{success&&<p className="ra-success" role="status">{success}</p>}
   {!loaded?<p>กำลังอ่านข้อมูลกองเงิน...</p>:<>
    <section className="ra-kpis"><div><span>กองเงินตั้งต้น</span><strong>{fmt(source)}</strong><small>บาท</small></div><div><span>จัดสรรแล้ว</span><strong>{fmt(allocated)}</strong><small>บาท</small></div><div className="ra-balance"><span>ยังไม่จัดสรร</span><strong>{fmt(remaining)}</strong><small>บาท</small></div></section>
    <section className="ra-allocation-toolbar" aria-label="จัดการกองเงินโอนเปลี่ยนแปลง">
      <div><h2>จัดสรรเงินโอนเปลี่ยนแปลง</h2><p>เพิ่มโครงการหรือกิจกรรมตามวงเงินที่ได้รับอนุมัติ</p></div>
      <button type="button" className="ra-create-button" onClick={()=>{setError('');setSuccess('');setAllocationOpen(true);}} disabled={busy||remaining<=0}>+ สร้างโครงการจากเงินโอน</button>
    </section>
    {allocationOpen&&<div className="ra-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setAllocationOpen(false);}}>
      <div className="ra-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ra-modal-title" tabIndex={-1} ref={allocationDialog}>
        <div className="ra-modal-header"><div><span className="ra-modal-kicker">จัดการเงินโอนเปลี่ยนแปลง · ปีงบประมาณ 2570</span><h2 id="ra-modal-title">สร้างโครงการ / กิจกรรมจากเงินโอน</h2><p>เงินยังไม่จัดสรร {fmt(remaining)} บาท · ระบุรายละเอียดตามเอกสารอนุมัติ</p></div><button className="ra-modal-close" type="button" aria-label="ปิดแบบฟอร์ม" disabled={busy} onClick={()=>setAllocationOpen(false)}>×</button></div>
        <div className="ra-modal-body">
          {error&&<p className="ra-error" role="alert">{error}</p>}
      <form onSubmit={e=>{e.preventDefault();if(!window.confirm('ยืนยันจัดสรรเงิน '+fmt(Number(amount))+' บาท จากกองเงินโอนเปลี่ยนแปลง?'))return;void send({action:'allocate',project_code:target,project_name:projectName,activity_name:activityName,agency,allocated_on:date,amount:Number(amount),reference,note});}}>
      <div className="ra-form">
       <label>ประเภทการจัดสรร<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">สร้างโครงการใหม่</option>{usedCodes.map(code=><option key={code} value={code}>เพิ่มกิจกรรมใน {code} · {active.find(t=>t.project_code===code)?.project_name}</option>)}</select></label>
       {!target&&<label>ชื่อโครงการใหม่<input required maxLength={350} placeholder="เช่น วันสถาปนาจังหวัดหนองบัวลำภู" value={projectName} onChange={e=>setProjectName(e.target.value)}/></label>}
       <label>ชื่อกิจกรรม<input required maxLength={500} value={activityName} onChange={e=>setActivityName(e.target.value)} placeholder="กิจกรรมที่ได้รับอนุมัติจัดสรร"/></label>
       <label>หน่วยดำเนินการ<input maxLength={180} value={agency} onChange={e=>setAgency(e.target.value)}/></label>
       <label>วันที่อนุมัติจัดสรร<input type="date" min="2026-11-10" max="2027-09-30" required value={date} onChange={e=>setDate(e.target.value)}/></label>
       <label>จำนวนเงินจัดสรร (บาท)<input type="number" required min="0.01" step="0.01" max={Math.max(0,remaining)} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
       <label className="ra-wide">เลขที่หนังสือ / เอกสารอนุมัติการโอน<input maxLength={300} required value={reference} onChange={e=>setReference(e.target.value)} placeholder="ระบุเลขที่หนังสืออนุมัติที่ตรวจสอบได้"/></label>
       <label className="ra-wide">หมายเหตุ<input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
      </div>
      <button disabled={busy||remaining<=0||!reference.trim()||!activityName.trim()||(!target&&!projectName.trim())}>จัดสรรเงินและบันทึกโครงการ</button>
      </form>
        </div>
      </div>
    </div>}
    <section className="ra-card ra-projects-card"><h2>โครงการที่ได้รับจัดสรรจากกองเงินนี้</h2>
      <p>เลือกโครงการเพื่อแก้ไขกิจกรรม บันทึกยอดผูกพัน (PO) หรือเบิกจ่าย</p>
      {activeByProject.length===0?<p>ยังไม่มีโครงการที่ได้รับจัดสรรจากกองเงินนี้</p>:activeByProject.map(project=>{
        const projectActivities=project.allocations.map(t=>({transfer:t,activity:transferredActivities.find(a=>a.id===t.activity_id)}));
        const projectBudget=project.allocations.reduce((v,t)=>v+Number(t.amount),0);
        const projectPo=projectActivities.reduce((sum,item)=>sum+poEntries.filter(p=>p.activity_id===item.activity?.id&&p.po_on<=today()).reduce((n,p)=>n+Number(p.amount),0),0);
        const projectPaid=projectActivities.reduce((sum,item)=>sum+(Number(item.activity?.baseline_disbursed??0)+entries.filter(e=>e.activity_id===item.activity?.id&&e.paid_on<=today()).reduce((n,e)=>n+Number(e.amount),0)),0);
        const expanded=expandedProject===project.code;
        return <article className="ra-funded-project" key={project.code}>
          <button type="button" className="ra-funded-project-toggle" aria-expanded={expanded} onClick={()=>setExpandedProject(expanded?'':project.code)}>
            <span className="ra-funded-project-title"><strong>{project.code} · {project.name}</strong><small>{project.allocations.length} กิจกรรม · วงเงินจัดสรร {fmt(projectBudget)} บาท</small></span>
            <span className="ra-funded-project-summary">PO {fmt(projectPo)} · เบิกจ่าย {fmt(projectPaid)} · คงเหลือ {fmt(projectBudget-projectPaid)} บาท <b>{expanded?'▴':'▾'}</b></span>
          </button>
          {expanded&&<div className="ra-funded-project-body">
            {projectActivities.map(({transfer,activity})=><section className="ra-funded-activity" key={transfer.id}>
              <div className="ra-funded-activity-head"><div><strong>{activity?.name??transfer.activity_name}</strong><small>หน่วยดำเนินการ: {activity?.agency||transfer.agency||'ไม่ระบุ'} · จัดสรร {thai(transfer.allocated_on)}</small><small>เอกสารอ้างอิง: {transfer.reference}</small></div><b>{fmt(Number(transfer.amount))} บาท</b></div>
              {activity?<TransferActivityManager activity={activity} allocatedOn={transfer.allocated_on} entries={entries.filter(e=>e.activity_id===activity.id)} poEntries={poEntries.filter(p=>p.activity_id===activity.id)} getToken={getToken} onSaved={reload}/>:<p className="ra-error">ข้อมูลกิจกรรมนี้ไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ</p>}
            </section>)}
          </div>}
        </article>;
      })}
      <div className="ra-transfer-history"><h3>ประวัติการจัดสรรเงินโอน</h3>
        <div className="ra-table-wrap"><table><thead><tr><th>โครงการ / กิจกรรม</th><th>วันที่จัดสรร</th><th>วงเงิน</th><th>เอกสารอ้างอิง</th><th>สถานะ</th></tr></thead><tbody>{transfers.length===0?<tr><td colSpan={5}>ยังไม่มีประวัติการจัดสรร</td></tr>:transfers.map(t=><tr key={t.id}><td><strong>{t.project_code} · {t.project_name}</strong><small>{t.activity_name}</small></td><td>{thai(t.allocated_on)}</td><td>{fmt(Number(t.amount))}</td><td>{t.reference}</td><td>{t.cancelled_on?'ยกเลิก '+thai(t.cancelled_on):'มีผล'}</td></tr>)}</tbody></table></div>
      </div>
    </section>
    {usedCodes.length>0&&<section className="ra-card"><h2>ยกเลิกการจัดสรรและคืนเงินเข้ากอง</h2><p>ยกเลิกได้เฉพาะโครงการที่ยังไม่มี PO หรือการเบิกจ่าย และต้องระบุเหตุผล</p>
     <form onSubmit={e=>{e.preventDefault();if(!window.confirm('ยืนยันยกเลิกการจัดสรรทั้งโครงการและคืนเงินเข้ากอง?'))return;void send({action:'cancel',project_code:cancelTarget,cancelled_on:cancelDate,reason:cancelReason});}}>
      <div className="ra-form"><label>โครงการ<select required value={cancelTarget} onChange={e=>setCancelTarget(e.target.value)}><option value="">เลือกโครงการ</option>{usedCodes.map(code=><option key={code} value={code}>{code} · {active.find(t=>t.project_code===code)?.project_name}</option>)}</select></label><label>วันที่ยกเลิก<input type="date" min="2026-11-10" max="2027-09-30" required value={cancelDate} onChange={e=>setCancelDate(e.target.value)}/></label><label className="ra-wide">เหตุผล / หลักฐานการยกเลิก<input required minLength={8} maxLength={1000} value={cancelReason} onChange={e=>setCancelReason(e.target.value)}/></label></div>
      <button className="ra-outline" disabled={busy||!cancelTarget||cancelReason.trim().length<8}>ยกเลิกจัดสรรและคืนยอดเข้ากอง</button>
     </form>
    </section>}
   </>}
  </>}
    </div>
  </div>
 </main>;
}
