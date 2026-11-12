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
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');const [error,setError]=useState('');
  useEffect(()=>{if(!client)return;client.auth.getSession().then(({data})=>setToken(data.session?.access_token??null));const {data:{subscription}}=client.auth.onAuthStateChange((_,s)=>setToken(s?.access_token??null));return()=>subscription.unsubscribe();},[client]);
  const validation=report?validateDisbursement(report):null;
  const getToken=async()=>{const {data}=await client!.auth.getSession();if(!data.session)throw Error('กรุณาเข้าสู่ระบบใหม่');return data.session.access_token;};
  async function signIn(e:React.FormEvent){e.preventDefault();if(!client)return;setBusy(true);setError('');const {error}=await client.auth.signInWithPassword({email,password});if(error)setError('เข้าสู่ระบบไม่สำเร็จ');setBusy(false);}
  async function loadSample(){setReport(sample as DisbursementReport);setPublished(false);setNotice('โหลดข้อมูลตัวอย่าง ณ 10 พฤศจิกายน 2569 แล้ว ยังไม่ได้บันทึกหรือเผยแพร่');setError('');}
  async function importFile(file:File|undefined){
    if(!file)return;
    setBusy(true);setError('');setNotice('');
    try{
      const value=await importDisbursementXlsx(file);
      setReport(value);setPublished(false);
      setNotice(`อ่านไฟล์ Excel สำเร็จ (${value.projects.length} รายการโครงการ, ${value.activities.length} รายการกิจกรรม) กรุณาตรวจสอบยอดก่อนบันทึกฉบับร่าง`);
    }catch(e){setError(e instanceof Error?e.message:'อ่าน Excel ไม่สำเร็จ');}
    finally{setBusy(false);}
  }
  async function loadSaved(){if(!report)return;setBusy(true);setError('');try{const res=await fetch(`/api/admin/disbursement?date=${report.as_of_date}`,{headers:{Authorization:`Bearer ${await getToken()}`}});const x=await res.json();if(!res.ok)throw Error(x.error);if(!x.report)throw Error('ยังไม่มีข้อมูลในฐานข้อมูลสำหรับวันที่นี้');setReport(x.report);setPublished(x.published);setNotice('โหลดข้อมูลที่บันทึกไว้แล้ว');}catch(e){setError(e instanceof Error?e.message:'อ่านข้อมูลไม่สำเร็จ');}finally{setBusy(false);}}
  async function save(){if(!report||!validation?.report)return; if(published&&!window.confirm('ยืนยันเผยแพร่ข้อมูลให้ประชาชนดูได้?'))return;setBusy(true);setError('');setNotice('');try{const res=await fetch('/api/admin/disbursement',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`},body:JSON.stringify({report,published})});const x=await res.json();if(!res.ok)throw Error([x.error,...(x.errors??[])].join('\n'));setNotice(published?'เผยแพร่รายงานสำเร็จแล้ว':'บันทึกฉบับร่างสำเร็จแล้ว');}catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ');}finally{setBusy(false);}}
  return <div className="da-body"><div className="da-wrap"><header className="da-head"><div><Link href="/">← กลับหน้า Dashboard</Link><h1>จัดการรายงานผลเบิกจ่าย</h1><p>ระบบเจ้าหน้าที่จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</p></div><div><Link href="/admin">ระบบจัดสรรเดิม</Link>{token&&<button onClick={()=>client?.auth.signOut()}>ออกจากระบบ</button>}</div></header>
  {!client?<div className="da-card">ยังไม่ได้กำหนดตัวแปร Supabase ใน Vercel</div>:!token?<form className="da-card da-login" onSubmit={signIn}><h2>เข้าสู่ระบบเจ้าหน้าที่</h2><label>อีเมล<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>รหัสผ่าน<input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>เข้าสู่ระบบ</button>{error&&<p className="da-error">{error}</p>}</form>:<>
  <section className="da-card"><h2>1. นำเข้าข้อมูล</h2><p>เลือกไฟล์ Excel (.xlsx) บัญชีผลการเบิกจ่าย ระบบจะอ่านชีต “ผลการเบิกจ่าย” โดยตรง พร้อมตรวจยอดก่อนบันทึก</p><div className="da-actions"><button disabled={busy} onClick={loadSample}>โหลดข้อมูลล่าสุด 10 พ.ย. 2569 ที่แนบในโปรเจกต์</button><label className="da-upload">เลือกไฟล์ Excel (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>importFile(e.target.files?.[0])}/></label><button disabled={!report||busy} onClick={loadSaved}>โหลดข้อมูลที่เคยบันทึกในวันที่เลือก</button></div><p className="da-info">ข้อมูล Excel จะถูกอ่านภายในเบราว์เซอร์ ไม่ส่งไฟล์ต้นฉบับขึ้นเซิร์ฟเวอร์ ระบบจะส่งเฉพาะรายการรายงานเมื่อกดบันทึก ต้องใช้รูปแบบไฟล์บัญชีผลการเบิกจ่ายของจังหวัดที่มีชีต “ผลการเบิกจ่าย”</p></section>
  {report&&<><section className="da-card"><h2>2. ตรวจสอบก่อนบันทึก</h2><p>วันที่ข้อมูล: <strong>{report.as_of_date}</strong> · แหล่งข้อมูล: {report.source_file}</p><div className="da-kpi"><div><span>งบประมาณรวม</span><b>{moneyTH(report.totals.budget)}</b></div><div><span>เบิกจ่ายแล้ว</span><b>{moneyTH(report.totals.disbursed)}</b></div><div><span>คงเหลือ</span><b>{moneyTH(report.totals.remaining)}</b></div><div><span>จำนวนโครงการ / รายละเอียดกิจกรรม</span><b>{report.projects.length} / {report.activities.length}</b></div></div><p>เงินเหลือจ่ายรวมอยู่ในระดับโครงการ และไม่ได้บวกยอดรายกิจกรรมซ้ำ</p>{validation&&validation.errors.length>0?<div className="da-error">{validation.errors.join(' · ')}</div>:<div className="da-success">ตรวจสอบยอดรวมระดับโครงการผ่าน</div>}</section>
  <section className="da-card"><h2>3. บันทึกและเผยแพร่</h2><label className="da-checkbox"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/> เผยแพร่สู่หน้ารายงานสาธารณะ (ไม่เลือก = ฉบับร่าง)</label><div className="da-actions"><button disabled={busy||!validation?.report} onClick={save}>{busy?'กำลังบันทึก...':published?'บันทึกและเผยแพร่':'บันทึกฉบับร่าง'}</button><Link href="/">เปิด Dashboard</Link></div></section></>}
  {notice&&<div className="da-success">{notice}</div>}{error&&<div className="da-error" style={{whiteSpace:'pre-wrap'}}>{error}</div>}</>}
  </div></div>;
}
