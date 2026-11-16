'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {MonitorActivity} from '@/lib/monitor';
import {fmt} from '@/lib/monitor';
import {X,CheckCircle2} from 'lucide-react';
export type ProjectSaving={activity_id:string;amount:number;confirmed_on:string;reference:string;note:string;updated_at:string};
type Row=MonitorActivity&{cumulative:number;po:number;remaining:number};
type Props={activity:Row;existing?:ProjectSaving;getToken:()=>Promise<string>;onSaved:()=>Promise<void>;onClose:()=>void;};
const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return p.year+'-'+p.month+'-'+p.day;};
export function ProjectSavingDialog({activity,existing,getToken,onSaved,onClose}:Props){
 const [amount,setAmount]=useState(existing?String(existing.amount):'');
 const [date,setDate]=useState(existing?.confirmed_on??today());
 const [reference,setReference]=useState(existing?.reference??'');
 const [note,setNote]=useState(existing?.note??'');
 const [removeMode,setRemoveMode]=useState(false);
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDivElement>(null);
 const available=Math.round((activity.budget-activity.cumulative-activity.po)*100)/100;
 useEffect(()=>{
  const before=document.body.style.overflow;document.body.style.overflow='hidden';
  const prior=document.activeElement instanceof HTMLElement?document.activeElement:null;
  dialog.current?.focus();
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}
   if(event.key!=='Tab')return;
   const items=[...dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled)')??[]];
   const first=items[0],last=items[items.length-1];
   if(!first||!last)return;
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=before;document.removeEventListener('keydown',onKey);prior?.focus();};
 },[busy,onClose]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');
  try{
   const payload=removeMode?{action:'remove',activity_id:activity.id,reason}:{action:'save',activity_id:activity.id,amount:Number(amount),confirmed_on:date,reference,note};
   const r=await fetch('/api/admin/savings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await getToken()},body:JSON.stringify(payload)});
   const data=await r.json();
   if(!r.ok)throw Error(data.error??'บันทึกข้อมูลไม่สำเร็จ');
   await onSaved();onClose();
  }catch(e){setError(e instanceof Error?e.message:'ไม่สามารถทำรายการได้');}finally{setBusy(false);}
 }
 return createPortal(<div className="mon-modal-backdrop mon-noprint" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
  <div ref={dialog} tabIndex={-1} className="mon-modal-panel mon-saving-dialog" role="dialog" aria-modal="true" aria-labelledby="saving-modal-title">
   <div className="mon-modal-header">
    <div><span className="mon-modal-eyebrow">งบประมาณจังหวัด · ปี 2570</span><h2 id="saving-modal-title">{removeMode?'ยกเลิกเงินเหลือจ่าย':existing?'แก้ไขเงินเหลือจ่าย':'บันทึกเงินเหลือจ่ายจากโครงการ'}</h2><p>{activity.project_code} · {activity.name}</p></div>
    <button type="button" className="mon-modal-close" disabled={busy} onClick={onClose} aria-label="ปิดหน้าต่าง"><X size={22}/></button>
   </div>
   <div className="mon-modal-body">
    <div className="mon-saving-summary"><div><span>งบประมาณกิจกรรม</span><b>{fmt(activity.budget)}</b></div><div><span>เบิกจ่ายแล้ว</span><b>{fmt(activity.cumulative)}</b></div><div><span>PO คงค้าง</span><b>{fmt(activity.po)}</b></div><div><span>วงเงินที่ยังไม่ติดภาระ</span><b>{fmt(available)}</b></div></div>
    <p className="mon-saving-advice"><CheckCircle2 size={17}/> เงินเหลือจ่ายเป็นส่วนหนึ่งของเงินที่ยังไม่เบิกจ่าย ไม่ใช่งบประมาณที่ได้รับเพิ่ม และไม่โอนให้โครงการอื่นโดยอัตโนมัติ</p>
    {error&&<p className="mon-error" role="alert">{error}</p>}
    <form onSubmit={submit}>
     {removeMode?<label className="mon-saving-field">เหตุผลการยกเลิกรายการ<textarea required minLength={8} maxLength={1000} rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="ระบุเหตุผลการยกเลิกตามหลักฐาน"/></label>:<div className="mon-saving-form">
      <label className="mon-saving-field">จำนวนเงินเหลือจ่าย (บาท)<input type="number" min="0.01" max={Math.max(0,available)} step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="เช่น 20000"/></label>
      <label className="mon-saving-field">วันที่ยืนยัน<input type="date" required min="2026-11-10" max="2027-09-30" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label className="mon-saving-field mon-saving-wide">เลขที่เอกสารอ้างอิง<input required maxLength={300} value={reference} onChange={e=>setReference(e.target.value)} placeholder="เลขที่หนังสือหรือหลักฐานยืนยันเงินเหลือจ่าย"/></label>
      <label className="mon-saving-field mon-saving-wide">หมายเหตุ (ถ้ามี)<textarea rows={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="รายละเอียดการดำเนินโครงการ"/></label>
     </div>}
     <div className="mon-saving-footer">
      {existing&&!removeMode&&<button className="mon-saving-danger" type="button" disabled={busy} onClick={()=>setRemoveMode(true)}>ยกเลิกรายการ</button>}
      <button type="button" className="mon-saving-cancel" disabled={busy} onClick={()=>removeMode?setRemoveMode(false):onClose()}>{removeMode?'กลับ':'ปิด'}</button>
      <button type="submit" disabled={busy||(!removeMode&&(!amount||!reference.trim()||Number(amount)>available))||(removeMode&&reason.trim().length<8)}>{busy?'กำลังบันทึก...':removeMode?'ยืนยันการยกเลิก':'บันทึกเงินเหลือจ่าย'}</button>
     </div>
    </form>
   </div>
  </div>
 </div>,document.body);
}
