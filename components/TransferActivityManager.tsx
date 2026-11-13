'use client';
import {useEffect,useRef,useState} from 'react';
import type {MonitorActivity,MonitorEntry} from '@/lib/monitor';
import type {MonitorPoEntry} from '@/lib/po';
import {fmt} from '@/lib/monitor';

type Action='edit'|'po-add'|'po-release'|'po-pay'|'payment'|'reduction';
const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
const title:Record<Action,string>={edit:'แก้ไขข้อมูลกิจกรรม', 'po-add':'เพิ่ม PO / ยอดผูกพัน','po-release':'ลดหรือยกเลิก PO','po-pay':'จ่ายจาก PO','payment':'บันทึกผลเบิกจ่าย','reduction':'ลดยอดเบิกจ่าย'};
export function TransferActivityManager({activity,allocatedOn,entries,poEntries,getToken,onSaved}:{activity:MonitorActivity;allocatedOn:string;entries:MonitorEntry[];poEntries:MonitorPoEntry[];getToken:()=>Promise<string>;onSaved:()=>Promise<void>}){
 const [action,setAction]=useState<Action|null>(null);
 const [history,setHistory]=useState(false);
 const [editEntry,setEditEntry]=useState<MonitorEntry|null>(null);
 const [name,setName]=useState(activity.name),[agency,setAgency]=useState(activity.agency);
 const [amount,setAmount]=useState(''),[date,setDate]=useState(today),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const dialog=useRef<HTMLDivElement>(null);
 const currentPo=poEntries.filter(p=>p.po_on<=today()).reduce((n,p)=>n+Number(p.amount),0);
 const paid=Number(activity.baseline_disbursed)+entries.filter(e=>e.paid_on<=today()).reduce((n,e)=>n+Number(e.amount),0);
 const canPo=currentPo>0.005;
 const canReduce=paid>0.005;
 const open=(kind:Action,entry:MonitorEntry|null=null)=>{
   setAction(kind);setEditEntry(entry);setError('');setMessage('');
   setName(activity.name);setAgency(activity.agency);setAmount(entry?String(Math.abs(entry.amount)):'');setDate(entry?.paid_on??today());
   setReference(entry?.reference??'');setNote(entry?.note??'');
 };
 useEffect(()=>{if(!action)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const scroll=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();
   const onKeys=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.preventDefault();setAction(null);}if(e.key!=='Tab')return;const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')??[]);if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};
   document.addEventListener('keydown',onKeys);return()=>{document.removeEventListener('keydown',onKeys);document.body.style.overflow=scroll;previous?.focus();};
 },[action,busy]);
 const send=async(url:string,payload:Record<string,unknown>,success:string)=>{
   setBusy(true);setError('');
   try{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await getToken()},body:JSON.stringify(payload)});const json=await res.json();if(!res.ok)throw Error(json.error??'ไม่สามารถบันทึกรายการได้');await onSaved();setAction(null);setEditEntry(null);setMessage(json.warning?success+' · '+json.warning:success);}
   catch(e){setError(e instanceof Error?e.message:'ไม่สามารถบันทึกรายการได้');}
   finally{setBusy(false);}
 };
 const onSubmit=(e:React.FormEvent<HTMLFormElement>)=>{
   e.preventDefault();if(!action||busy)return;
   if(action==='edit'){void send('/api/admin/activities',{action:'update-transfer-activity',id:activity.id,name,agency},'แก้ไขข้อมูลกิจกรรมแล้ว');return;}
   const amt=Number(amount);
   if(!Number.isFinite(amt)||amt<=0||Math.round(amt*100)/100!==amt){setError('จำนวนเงินไม่ถูกต้อง');return;}
   if(date<allocatedOn){setError('วันที่รายการต้องไม่ก่อนวันที่ได้รับอนุมัติจัดสรรเงินโอน');return;}
   const ref=reference.trim(),reason=note.trim();
   if(action.startsWith('po-')){
     if(!ref&&!reason){setError('กรุณาระบุเลขที่สัญญาหรือเหตุผลประกอบรายการ PO');return;}
     const kind=action==='po-add'?'add':action==='po-release'?'release':'pay';
     if(kind==='pay'&&!window.confirm('ยืนยันจ่ายจาก PO? ระบบจะลดยอด PO และเพิ่มยอดเบิกจ่ายจริงพร้อมกัน'))return;
     void send('/api/admin/po',{activity_id:activity.id,po_on:date,amount:amt,kind,reference:ref,note:reason},'บันทึกรายการ PO เรียบร้อยแล้ว');return;
   }
   const kind=action==='reduction'?'reduction':'disbursement';
   if(kind==='reduction'&&!ref&&!reason){setError('กรุณาระบุเอกสารหรือเหตุผลการลดยอด');return;}
   void send('/api/admin/monitor',{action:'save-entry',id:editEntry?.id||undefined,activity_id:activity.id,paid_on:date,amount:amt,kind,reference:ref,note:reason},'บันทึกรายการเบิกจ่ายเรียบร้อยแล้ว');
 };
 const remove=async(entry:MonitorEntry)=>{
   if(!window.confirm('ยืนยันลบรายการเบิกจ่ายนี้? ระบบจะตรวจสอบความถูกต้องของยอดและเก็บประวัติการลบ'))return;
   await send('/api/admin/monitor',{action:'delete-entry',id:entry.id},'ลบรายการเบิกจ่ายแล้ว');
 };
 return <div className="ra-activity-manager">
   <div className="ra-activity-totals">
     <span><small>วงเงินจัดสรร</small><b>{fmt(Number(activity.budget))}</b></span>
     <span><small>PO คงค้าง</small><b>{fmt(currentPo)}</b></span>
     <span><small>เบิกจ่ายสะสม</small><b>{fmt(paid)}</b></span>
     <span><small>คงเหลือยังไม่เบิกจ่าย</small><b>{fmt(Number(activity.budget)-paid)}</b></span>
   </div>
   <div className="ra-activity-actions">
     <button type="button" className="ra-action-light" onClick={()=>open('edit')}>แก้ไขกิจกรรม</button>
     <button type="button" onClick={()=>open('po-add')}>+ PO</button>
     <button type="button" className="ra-action-light" disabled={!canPo} onClick={()=>open('po-release')}>ลด PO</button>
     <button type="button" className="ra-action-light" disabled={!canPo} onClick={()=>open('po-pay')}>จ่ายจาก PO</button>
     <button type="button" onClick={()=>open('payment')}>+ เบิกจ่าย</button>
     <button type="button" className="ra-action-light" disabled={!canReduce} onClick={()=>open('reduction')}>ลดยอดเบิกจ่าย</button>
     <button type="button" className="ra-action-light" aria-expanded={history} onClick={()=>setHistory(v=>!v)}>{history?'ซ่อนประวัติ':'ดูประวัติ'}</button>
   </div>
   {message&&<p className="ra-success" role="status">{message}</p>}
   {!action&&error&&<p className="ra-error" role="alert">{error}</p>}
   {history&&<div className="ra-activity-history">
     <h4>ประวัติการเบิกจ่าย</h4>
     {entries.length===0?<p>ยังไม่มีรายการเบิกจ่ายเพิ่ม</p>:<div className="ra-table-wrap"><table><thead><tr><th>วันที่</th><th>จำนวนเงิน (บาท)</th><th>เอกสารอ้างอิง</th><th>จัดการ</th></tr></thead><tbody>{[...entries].sort((a,b)=>b.paid_on.localeCompare(a.paid_on)).map(e=><tr key={e.id}><td>{e.paid_on}</td><td>{e.amount<0?'−':''}{fmt(Math.abs(Number(e.amount)))}</td><td>{e.reference||e.note||'—'}</td><td><button type="button" className="ra-action-light" onClick={()=>open(e.amount<0?'reduction':'payment',e)}>แก้ไข</button> <button type="button" className="ra-action-light" onClick={()=>void remove(e)}>ลบ</button></td></tr>)}</tbody></table></div>}
     <h4>ประวัติ PO / ยอดผูกพัน</h4>
     {poEntries.length===0?<p>ยังไม่มีรายการ PO</p>:<div className="ra-table-wrap"><table><thead><tr><th>วันที่</th><th>ประเภท</th><th>ยอดเคลื่อนไหว PO</th><th>เอกสารอ้างอิง</th></tr></thead><tbody>{[...poEntries].sort((a,b)=>b.po_on.localeCompare(a.po_on)).map(p=><tr key={p.id}><td>{p.po_on}</td><td>{p.kind==='add'?'เพิ่ม PO':p.kind==='pay'?'จ่ายจาก PO':'ลด PO'}</td><td>{p.amount<0?'−':'+'}{fmt(Math.abs(Number(p.amount)))}</td><td>{p.reference||p.note||'—'}</td></tr>)}</tbody></table></div>}
   </div>}
   {action&&<div className="ra-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setAction(null);}}>
     <div className="ra-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ra-transfer-title" tabIndex={-1} ref={dialog}>
       <div className="ra-modal-header"><div><span className="ra-modal-kicker">{activity.project_code} · กิจกรรมจากเงินโอนเปลี่ยนแปลง</span><h2 id="ra-transfer-title">{title[action]}</h2><p>{activity.name}</p></div><button type="button" className="ra-modal-close" disabled={busy} aria-label="ปิดหน้าต่าง" onClick={()=>setAction(null)}>×</button></div>
       <div className="ra-modal-body">
         {error&&<p className="ra-error" role="alert">{error}</p>}
         <form onSubmit={onSubmit}>
           {action==='edit'?<div className="ra-form">
             <label className="ra-wide">ชื่อกิจกรรม<input required value={name} maxLength={500} onChange={e=>setName(e.target.value)}/></label>
             <label className="ra-wide">หน่วยดำเนินการ<input value={agency} maxLength={180} onChange={e=>setAgency(e.target.value)}/></label>
             <p className="ra-wide ra-form-note">วงเงิน {fmt(Number(activity.budget))} บาท อ้างอิงเอกสารจัดสรรเดิม ไม่สามารถเปลี่ยนวงเงินในแบบฟอร์มนี้ได้</p>
           </div>:<div className="ra-form">
             <label>วันที่รายการ<input type="date" required min={allocatedOn<'2026-11-10'?'2026-11-10':allocatedOn} max="2027-09-30" value={date} onChange={e=>setDate(e.target.value)}/></label>
             <label>จำนวนเงิน (บาท)<input type="number" min="0.01" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
             <label className="ra-wide">เลขที่ PO / สัญญา / เอกสารอ้างอิง<input value={reference} maxLength={300} onChange={e=>setReference(e.target.value)}/></label>
             <label className="ra-wide">หมายเหตุ / เหตุผล<input value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/></label>
             <p className="ra-wide ra-form-note">ระบบตรวจสอบยอดเบิกจ่ายรวม PO ไม่ให้เกินวงเงินที่ได้รับจัดสรร และเก็บประวัติการทำรายการ</p>
           </div>}
           <div className="ra-modal-footer"><button type="button" className="ra-action-light" disabled={busy} onClick={()=>setAction(null)}>ยกเลิก</button><button type="submit" disabled={busy||action==='edit'&&!name.trim()}>{busy?'กำลังบันทึก...':'บันทึกข้อมูล'}</button></div>
         </form>
       </div>
     </div>
   </div>}
 </div>;
}
