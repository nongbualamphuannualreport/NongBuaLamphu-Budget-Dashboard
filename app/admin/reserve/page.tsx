'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import Link from 'next/link';
import '@/app/reserve/reserve.css';
type Transfer={id:string;project_code:string;project_name:string;activity_name:string;agency:string;allocated_on:string;amount:number;reference:string;note:string};
type Data={summary:{initial:number;allocated:number;remaining:number};transfers:Transfer[];projects:{code:string;name:string}[]};
const fmt=(n:number)=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:2}).format(n);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function ReserveAdminPage(){
 const client=useMemo(()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;return url&&key?createClient(url,key):null},[]);
 const [token,setToken]=useState<string|null>(null);
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [projectCode,setProjectCode]=useState(''),[projectName,setProjectName]=useState(''),[activityName,setActivityName]=useState(''),[agency,setAgency]=useState('');
 const [date,setDate]=useState(today),[amount,setAmount]=useState(''),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const [reverseId,setReverseId]=useState(''),[reverseReason,setReverseReason]=useState('');
 useEffect(()=>{if(!client)return;void client.auth.getSession().then(({data:d})=>setToken(d.session?.access_token??null));
 const {data:{subscription}}=client.auth.onAuthStateChange((_,s)=>setToken(s?.access_token??null));
 return()=>subscription.unsubscribe()},[client]);
 const load=useCallback(async()=>{
  if(!client)return;setBusy(true);setError('');
  try{const {data:s}=await client.auth.getSession();const t=s.session?.access_token;
   if(!t)throw Error('กรุณาเข้าสู่ระบบหลังบ้านก่อน');
   const r=await fetch('/api/admin/reserve',{headers:{Authorization:'Bearer '+t},cache:'no-store'});const json=await r.json();
   if(!r.ok)throw Error(json.error??'โหลดข้อมูลไม่ได้');setData(json);
  }catch(e){setError(e instanceof Error?e.message:'โหลดข้อมูลไม่สำเร็จ')}finally{setBusy(false)}
 },[client]);
 useEffect(()=>{if(token)void load()},[token,load]);
 async function submit(action:'allocate'|'reverse'){
  if(!client)return;setBusy(true);setError('');setMessage('');
  try{const {data:s}=await client.auth.getSession();if(!s.session)throw Error('กรุณาเข้าสู่ระบบใหม่');
   const payload=action==='allocate'?
    {action,project_code:projectCode,project_name:projectName,activity_name:activityName,agency,allocated_on:date,
     amount:Number(amount),reference,note}:
    {action,id:reverseId,reason:reverseReason};
   const r=await fetch('/api/admin/reserve',{method:'POST',headers:{'Content-Type':'application/json',
    Authorization:'Bearer '+s.session.access_token},body:JSON.stringify(payload)});
   const j=await r.json();if(!r.ok)throw Error(j.error??'บันทึกไม่สำเร็จ');
   if(action==='allocate'){setAmount('');setActivityName('');setNote('');setReference('')}
   else {setReverseId('');setReverseReason('')}
   setMessage(action==='allocate'?'จัดสรรเงินและสร้างกิจกรรมสำเร็จแล้ว':'ยกเลิกการจัดสรรและคืนเงินเข้ากองกลางแล้ว');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}finally{setBusy(false)}
 }
 return <main className="rv-page">
  <nav className="rv-nav"><Link href="/admin">← กลับหลังบ้าน</Link><Link href="/reserve">ดูหน้าสาธารณะ</Link></nav>
  <header className="rv-hero"><span>ระบบจัดการงบประมาณ · สำหรับเจ้าหน้าที่</span><h1>จัดสรรเงินโอนเปลี่ยนแปลง</h1>
   <p>แยกจาก 10 โครงการหลัก สร้างโครงการใหม่ภายใต้วงเงินเดิมโดยไม่ทำให้ยอดงบจังหวัดเพิ่มซ้ำ</p></header>
  {!token?<section className="rv-section"><h2>กรุณาเข้าสู่ระบบเจ้าหน้าที่</h2><p>ล็อกอินที่หลังบ้านก่อน แล้วจึงเปิดหน้านี้อีกครั้ง</p><Link href="/admin">เข้าสู่หลังบ้าน</Link></section>:
  <>
   {data&&<section className="rv-metrics"><div><small>วงเงินเดิม</small><strong>{fmt(data.summary.initial)}</strong><span>บาท</span></div>
    <div><small>จัดสรรแล้ว</small><strong>{fmt(data.summary.allocated)}</strong><span>บาท</span></div>
    <div className="rv-remaining"><small>คงเหลือสร้างโครงการใหม่ได้</small><strong>{fmt(data.summary.remaining)}</strong><span>บาท</span></div></section>}
   {error&&<p className="rv-error" role="alert">{error}</p>}{message&&<p className="rv-success" role="status">{message}</p>}
   <section className="rv-section"><h2>สร้างโครงการ / กิจกรรม จากเงินกองนี้</h2>
    <p>เลือกสร้างโครงการใหม่ หรือเพิ่มกิจกรรมภายใต้โครงการที่เคยจัดสรรจากกองเงินนี้</p>
    <form className="rv-form" onSubmit={e=>{e.preventDefault();if(!window.confirm('ยืนยันจัดสรรเงิน '+fmt(Number(amount))+' บาท จากกองเงินโอนเปลี่ยนแปลง?'))return;void submit('allocate')}}>
     <label>สร้างโครงการใหม่ / เพิ่มในโครงการเดิม
      <select value={projectCode} onChange={e=>setProjectCode(e.target.value)}>
       <option value="">สร้างโครงการใหม่</option>
       {(data?.projects??[]).map(p=><option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
      </select></label>
     {!projectCode&&<label>ชื่อโครงการใหม่<input required maxLength={350} value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="ชื่อโครงการตามเอกสารอนุมัติ"/></label>}
     <label>ชื่อกิจกรรม / รายการ<input required maxLength={500} value={activityName} onChange={e=>setActivityName(e.target.value)} placeholder="กิจกรรมที่ได้รับจัดสรร"/></label>
     <label>หน่วยดำเนินการ<input maxLength={180} value={agency} onChange={e=>setAgency(e.target.value)} placeholder="ส่วนราชการที่รับผิดชอบ"/></label>
     <label>วันที่จัดสรร<input required type="date" min="2026-11-10" max="2027-09-30" value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label>วงเงินที่จะจัดสรร (บาท)<input required type="number" step="0.01" min="0.01" max={data?.summary.remaining??undefined} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label>เลขที่หนังสือ / เอกสารอ้างอิง<input required maxLength={300} value={reference} onChange={e=>setReference(e.target.value)}/></label>
     <label className="rv-wide">หมายเหตุ<input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
     <button type="submit" disabled={busy||!data||Number(amount)>data.summary.remaining||!reference.trim()}>{busy?'กำลังบันทึก...':'จัดสรรเงินและสร้างรายการ'}</button>
    </form>
   </section>
   <section className="rv-section"><h2>รายการจัดสรร / ประวัติการใช้เงินกองกลาง</h2>
     <p>หากสร้างโครงการผิดและยังไม่มีเบิกจ่ายหรือ PO สามารถยกเลิกการจัดสรรพร้อมคืนวงเงินได้ โดยประวัติการยกเลิกยังถูกเก็บไว้</p>
     <div className="rv-transfers">{(data?.transfers??[]).map(t=><article key={t.id} className="rv-transfer">
      <div><small>{t.project_code} · {t.allocated_on}</small><strong>{t.project_name}</strong>
       <span>{t.activity_name} · {t.agency||'ไม่ระบุหน่วยงาน'}</span><small>อ้างอิง: {t.reference}</small></div>
      <div className="rv-transfer-side"><b>{fmt(Number(t.amount))} บาท</b>
       <button type="button" disabled={busy} onClick={()=>{setReverseId(t.id);setReverseReason('')}}>ยกเลิกการจัดสรร</button></div>
     </article>)}{!data?.transfers?.length&&<p>ยังไม่มีการจัดสรรเงิน</p>}</div>
   </section>
   {reverseId&&<section className="rv-section rv-reverse"><h2>ยืนยันยกเลิกการจัดสรร</h2>
    <p>รายการนี้จะถูกยกเลิกและคืนวงเงินเข้ากองกลาง เฉพาะเมื่อไม่มีรายการเบิกจ่ายหรือ PO ผูกอยู่</p>
    <label>เหตุผลที่ยกเลิก<input required minLength={8} value={reverseReason} onChange={e=>setReverseReason(e.target.value)} placeholder="ระบุสาเหตุพร้อมหลักฐาน"/></label>
    <div className="rv-actions"><button disabled={busy||reverseReason.trim().length<8} onClick={()=>{if(window.confirm('ยืนยันยกเลิกการจัดสรรนี้?'))void submit('reverse')}}>ยืนยันยกเลิกและคืนวงเงิน</button><button onClick={()=>setReverseId('')} type="button">กลับ</button></div>
   </section>}
  </>}
 </main>
}
