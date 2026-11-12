'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@supabase/supabase-js';
import {validateDisbursement, moneyTH, type DisbursementReport} from '@/lib/disbursement';
import sample from '@/data/disbursement-2026-11-10.json';
import {importDisbursementXlsx} from '@/lib/import-xlsx';
export function DisbursementAdmin(){
  const client=useMemo(()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url&&key?createClient(url,key):null;
  },[]);
  const [token,setToken]=useState<string|null>(null);
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [report,setReport]=useState<DisbursementReport|null>(null);
  const [published,setPublished]=useState(false);
  const [saved,setSaved]=useState<{as_of_date:string;published:boolean;updated_at:string}[]>([]);
  const [selectedDate,setSelectedDate]=useState('');
  const [loadingHistory,setLoadingHistory]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');const [error,setError]=useState('');
  useEffect(()=>{if(!client)return;client.auth.getSession().then(({data})=>setToken(data.session?.access_token??null));const {data:{subscription}}=client.auth.onAuthStateChange((_,s)=>setToken(s?.access_token??null));return()=>subscription.unsubscribe();},[client]);
  const validation=report?validateDisbursement(report):null;
  const getToken=async()=>{const {data}=await client!.auth.getSession();if(!data.session)throw Error('กรุณาเข้าสู่ระบบใหม่');return data.session.access_token;};
  async function signIn(e:React.FormEvent){e.preventDefault();if(!client)return;setBusy(true);setError('');const {error}=await client.auth.signInWithPassword({email,password});if(error)setError('เข้าสู่ระบบไม่สำเร็จ');setBusy(false);}
  async function loadSample(){setReport(sample as DisbursementReport);setSelectedDate('');setPublished(false);setNotice('โหลดข้อมูลตัวอย่าง ณ 10 พฤศจิกายน 2569 แล้ว ยังไม่ได้บันทึกหรือเผยแพร่');setError('');}
  async function importFile(file:File|undefined){
    if(!file)return;
    setBusy(true);setError('');setNotice('');
    try{
      const value=await importDisbursementXlsx(file);
      setReport(value);setSelectedDate('');setPublished(false);
      setNotice(`อ่านไฟล์ Excel สำเร็จ (${value.projects.length} รายการโครงการ, ${value.activities.length} รายการกิจกรรม) กรุณาตรวจสอบยอดก่อนบันทึกฉบับร่าง`);
    }catch(e){setError(e instanceof Error?e.message:'อ่าน Excel ไม่สำเร็จ');}
    finally{setBusy(false);}
  }
  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res=await fetch('/api/admin/disbursement?mode=list',{headers:{Authorization:`Bearer ${await getToken()}`},cache:'no-store'});
      const x=await res.json();if(!res.ok)throw Error(x.error??'โหลดประวัติไม่สำเร็จ');
      setSaved(x.items??[]);
    } catch(e) {setError(e instanceof Error?e.message:'โหลดประวัติไม่สำเร็จ');}
    finally{setLoadingHistory(false);}
  }
  async function loadSaved(date?:string){
    setBusy(true);setError('');setNotice('');
    try{
      const url=date?`/api/admin/disbursement?date=${encodeURIComponent(date)}`:'/api/admin/disbursement';
      const res=await fetch(url,{headers:{Authorization:`Bearer ${await getToken()}`},cache:'no-store'});
      const x=await res.json();if(!res.ok)throw Error(x.error??'อ่านข้อมูลไม่สำเร็จ');
      if(!x.report){setReport(null);setSelectedDate('');setNotice('ยังไม่มีรายงานที่บันทึกในฐานข้อมูล กดโหลดข้อมูลตัวอย่างหรืออัปโหลด Excel เพื่อเริ่มต้น');return;}
      setReport(x.report);setPublished(!!x.published);setSelectedDate(x.date??x.report.as_of_date);
      setNotice(`เปิดข้อมูลวันที่ ${displayDate(x.report.as_of_date)} แล้ว (${x.published?'เผยแพร่แล้ว':'ฉบับร่าง'})`);
    }catch(e){setError(e instanceof Error?e.message:'อ่านข้อมูลไม่สำเร็จ');}
    finally{setBusy(false);}
  }
  const displayDate=(iso:string)=>{const [y,m,d]=iso.split('-').map(Number);return `${d}/${m}/${y+543}`;};
  useEffect(()=>{
    if(!token){setSaved([]);setReport(null);return;}
    void loadSaved();void loadHistory();
  // Load once per authenticated session; do not reset unsaved edits on token refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[Boolean(token)]);
  async function save(){if(!report||!validation?.report)return; if(published&&!window.confirm('ยืนยันเผยแพร่ข้อมูลให้ประชาชนดูได้?'))return;setBusy(true);setError('');setNotice('');try{const res=await fetch('/api/admin/disbursement',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`},body:JSON.stringify({report,published})});const x=await res.json();if(!res.ok)throw Error([x.error,...(x.errors??[])].join('\n'));setSelectedDate(report.as_of_date);setNotice(published?'เผยแพร่รายงานสำเร็จแล้ว':'บันทึกฉบับร่างสำเร็จแล้ว');await loadHistory();}catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ');}finally{setBusy(false);}}
  return <div className="da-body"><div className="da-wrap"><header className="da-head"><div><Link href="/">← กลับหน้า Dashboard</Link><h1>จัดการรายงานผลเบิกจ่าย</h1><p>ระบบเจ้าหน้าที่จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</p></div><div><Link href="/admin">ระบบจัดสรรเดิม</Link>{token&&<button onClick={()=>client?.auth.signOut()}>ออกจากระบบ</button>}</div></header>
  {!client?<div className="da-card">ยังไม่ได้กำหนดตัวแปร Supabase ใน Vercel</div>:!token?<form className="da-card da-login" onSubmit={signIn}><h2>เข้าสู่ระบบเจ้าหน้าที่</h2><label>อีเมล<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>รหัสผ่าน<input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>เข้าสู่ระบบ</button>{error&&<p className="da-error">{error}</p>}</form>:<>
  <section className="da-card"><h2>รายงานที่บันทึกไว้ในระบบ</h2>
    <p>เมื่อเข้าหน้านี้ ระบบเปิดรายงานล่าสุดให้อัตโนมัติ ไม่ต้องจำหรือกรอกวันที่เอง คลิกวันที่ด้านล่างเพื่อเปิดรายงานเก่า</p>
    <div className="da-actions"><button disabled={busy||loadingHistory} onClick={()=>{void loadSaved();void loadHistory();}}>รีเฟรช / เปิดรายงานล่าสุด</button>
    <label>เลือกจากประวัติรายงาน <select aria-label="เลือกวันที่ที่เคยบันทึก" value={selectedDate} onChange={e=>{setSelectedDate(e.target.value);if(e.target.value)void loadSaved(e.target.value);}}>
      <option value="">{saved.length?'เลือกวันที่จากรายการ':'ยังไม่มีรายงานบันทึกไว้'}</option>
      {saved.map(r=><option key={r.as_of_date} value={r.as_of_date}>{displayDate(r.as_of_date)} — {r.published?'เผยแพร่แล้ว':'ฉบับร่าง'}</option>)}
    </select></label></div>
    {saved.length>0?<div className="da-history">{saved.map(r=><button key={r.as_of_date} className={selectedDate===r.as_of_date?'da-history-active':''} disabled={busy} onClick={()=>{setSelectedDate(r.as_of_date);void loadSaved(r.as_of_date);}}>{displayDate(r.as_of_date)} <span>{r.published?'เผยแพร่แล้ว':'ฉบับร่าง'}</span></button>)}</div>:<p>ยังไม่มีข้อมูลที่บันทึกในส่วนผลเบิกจ่าย สามารถเริ่มต้นด้วยไฟล์ Excel หรือข้อมูลตัวอย่างด้านล่างได้</p>}
  </section>
  <section className="da-card"><h2>นำเข้าข้อมูล Excel ใหม่</h2><p>เลือกไฟล์ Excel (.xlsx) บัญชีผลการเบิกจ่าย ระบบจะอ่านชีต “ผลการเบิกจ่าย” โดยตรง พร้อมตรวจยอดก่อนบันทึก</p><div className="da-actions"><button disabled={busy} onClick={loadSample}>โหลดข้อมูลล่าสุด 10 พ.ย. 2569 ที่แนบในโปรเจกต์</button><label className="da-upload">เลือกไฟล์ Excel (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>importFile(e.target.files?.[0])}/></label></div><p className="da-info">ข้อมูล Excel จะถูกอ่านภายในเบราว์เซอร์ ไม่ส่งไฟล์ต้นฉบับขึ้นเซิร์ฟเวอร์ ระบบจะส่งเฉพาะรายการรายงานเมื่อกดบันทึก ต้องใช้รูปแบบไฟล์บัญชีผลการเบิกจ่ายของจังหวัดที่มีชีต “ผลการเบิกจ่าย”</p></section>
  {report&&<><section className="da-card"><h2>ตรวจสอบข้อมูลที่เปิดอยู่</h2><p>วันที่ข้อมูล: <strong>{report.as_of_date}</strong> · แหล่งข้อมูล: {report.source_file}</p><div className="da-kpi"><div><span>งบประมาณรวม</span><b>{moneyTH(report.totals.budget)}</b></div><div><span>เบิกจ่ายแล้ว</span><b>{moneyTH(report.totals.disbursed)}</b></div><div><span>คงเหลือ</span><b>{moneyTH(report.totals.remaining)}</b></div><div><span>จำนวนโครงการ / รายละเอียดกิจกรรม</span><b>{report.projects.length} / {report.activities.length}</b></div></div><p>เงินเหลือจ่ายรวมอยู่ในระดับโครงการ และไม่ได้บวกยอดรายกิจกรรมซ้ำ</p>{validation&&validation.errors.length>0?<div className="da-error">{validation.errors.join(' · ')}</div>:<div className="da-success">ตรวจสอบยอดรวมระดับโครงการผ่าน</div>}</section>
  <section className="da-card"><h2>บันทึกและเผยแพร่</h2><label className="da-checkbox"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/> เผยแพร่สู่หน้ารายงานสาธารณะ (ไม่เลือก = ฉบับร่าง)</label><div className="da-actions"><button disabled={busy||!validation?.report} onClick={save}>{busy?'กำลังบันทึก...':published?'บันทึกและเผยแพร่':'บันทึกฉบับร่าง'}</button><Link href="/">เปิด Dashboard</Link></div></section></>}
  {notice&&<div className="da-success">{notice}</div>}{error&&<div className="da-error" style={{whiteSpace:'pre-wrap'}}>{error}</div>}</>}
  </div></div>;
}
