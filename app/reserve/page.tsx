import Link from 'next/link';
import {getPublicReport} from '@/lib/public-report';
import {isConfigured,serverDb} from '@/lib/supabase';
import type {ReallocationTransfer} from '@/lib/reallocation';
import {fmt} from '@/lib/monitor';
import './reserve.css';
import {PublicReserveShell} from '@/components/PublicReserveShell';
export const dynamic='force-dynamic';
const thai=(s:string)=>new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(s+'T12:00:00+07:00'));
export default async function ReservePublicPage(){
 const data=await getPublicReport('9999-12-31');
 const report=data.report;
 let transfers:ReallocationTransfer[]=[];
 let error='';
 if(isConfigured()){
  const db=serverDb();
  const r=await db.from('monitor_reallocation_transfers').select('*').order('allocated_on',{ascending:false}).limit(1000);
  if(r.error)error='ไม่สามารถอ่านรายละเอียดการโอนเปลี่ยนแปลงได้';
  else transfers=(r.data??[]) as ReallocationTransfer[];
 }
 const asOf=report?.as_of_date??'2026-11-13';
 const active=transfers.filter(t=>t.allocated_on<=asOf&&(!t.cancelled_on||t.cancelled_on>asOf));
 const allocated=active.reduce((n,t)=>n+Number(t.amount),0);
 const remaining=Number(report?.projects.find(p=>p.code==='RESERVE')?.budget??672700);
 const initial=remaining+allocated;
 const grouped=[...new Set(active.map(t=>t.project_code))].map(code=>({
  code,name:active.find(t=>t.project_code===code)?.project_name??code,
  budget:active.filter(t=>t.project_code===code).reduce((n,t)=>n+Number(t.amount),0),
  paid:report?.projects.find(p=>p.code===code)?.disbursed??0,
  po:report?.projects.find(p=>p.code===code)?.po??0,
  details:active.filter(t=>t.project_code===code)
 }));
 return <PublicReserveShell><div className="rv-wrap">
  <header className="rv-top"><div><Link href="/">← กลับหน้าภาพรวมงบประมาณ</Link><h1>เงินคงเหลือจากการโอนเปลี่ยนแปลง</h1>
  <p>ข้อมูลการจัดสรรเงินและโครงการเพิ่มเติม · จังหวัดหนองบัวลำภู ปีงบประมาณ พ.ศ. 2570</p></div><Link href="/admin/reserve">สำหรับเจ้าหน้าที่</Link></header>
  {error&&<p role="alert">{error}</p>}
  <section className="rv-summary" aria-label="สถานะเงินโอนเปลี่ยนแปลง">
   <article><span>วงเงินกองเงินเริ่มต้น</span><strong>{fmt(initial)}</strong><small>บาท</small></article>
   <article><span>จัดสรรไปยังโครงการแล้ว</span><strong>{fmt(allocated)}</strong><small>บาท</small></article>
   <article><span>ยังไม่จัดสรร</span><strong>{fmt(remaining)}</strong><small>บาท</small></article>
  </section>
  <section className="rv-card"><h2>โครงการที่ได้รับจัดสรรจากกองเงินนี้</h2><p>รายละเอียดงบประมาณและผลเบิกจ่ายของแต่ละโครงการ</p>
    {grouped.length===0?<p>ยังไม่มีรายการจัดสรรโครงการจากกองเงินนี้</p>:grouped.map(p=>
     <div className="rv-project" key={p.code}><div><strong>{p.code} · {p.name}</strong>
       {p.details.map(t=><small key={t.id}>{t.activity_name} · จัดสรร {thai(t.allocated_on)} · เลขที่เอกสาร {t.reference}</small>)}
       <small>PO คงค้าง {fmt(p.po)} บาท · เบิกจ่ายสะสม {fmt(p.paid)} บาท</small>
      </div><b>{fmt(p.budget)} บาท</b></div>
    )}
  </section>
  <p className="rv-note">ยอดเงินที่จัดสรรให้โครงการแล้วรวมอยู่ในงบประมาณจังหวัด ไม่ใช่งบประมาณเพิ่มเติม · ข้อมูล ณ {thai(asOf)}</p>
 </div></PublicReserveShell>;
}
