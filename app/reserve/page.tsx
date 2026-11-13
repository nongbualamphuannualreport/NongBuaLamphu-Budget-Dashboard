import Link from 'next/link';
import {serverDb} from '@/lib/supabase';
import {getPublicReport} from '@/lib/public-report';
import './reserve.css';
export const dynamic='force-dynamic';
const fmt=(n:number)=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:2}).format(n);
export default async function ReservePage(){
 const {report}=await getPublicReport('9999-12-31');
 if(!report)return <main className="rv-page"><h1>ยังไม่มีข้อมูลกองเงินโอนเปลี่ยนแปลง</h1><Link href="/">ย้อนกลับหน้าแรก</Link></main>;
 const db=serverDb();
 const {data:transfers,error}=await db.from('monitor_reallocation_transfers')
  .select('project_code,project_name,activity_name,agency,allocated_on,amount,reference,note')
  .order('allocated_on',{ascending:false}).order('project_code',{ascending:true});
 const total=report.projects.find(p=>p.code==='RESERVE')?.budget??0;
 const allocations=transfers??[];
 const allocated=allocations.reduce((n,r)=>n+Number(r.amount),0);
 const opening=total+allocated;
 const projects=report.projects.filter(p=>/^(T[0-9]{2,3}|P11)$/.test(String(p.code))&&allocations.some(t=>t.project_code===p.code));
 return <main className="rv-page">
   <nav className="rv-nav"><Link href="/">← กลับ Dashboard</Link><span>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</span></nav>
   <header className="rv-hero"><span>รายงานเงินโอนเปลี่ยนแปลง</span>
    <h1>กองเงินคงเหลือจากการโอนเปลี่ยนแปลง</h1>
    <p>เงินที่จัดสรรเป็นโครงการใหม่แล้วจะหักจากกองเงินนี้ และไม่เพิ่มยอดงบประมาณรวมจังหวัดซ้ำ</p>
   </header>
   <section className="rv-metrics">
    <div><small>วงเงินเริ่มต้น</small><strong>{fmt(opening)}</strong><span>บาท</span></div>
    <div><small>จัดสรรเป็นโครงการแล้ว</small><strong>{fmt(allocated)}</strong><span>บาท</span></div>
    <div className="rv-remaining"><small>คงเหลือยังไม่จัดสรร</small><strong>{fmt(total)}</strong><span>บาท</span></div>
   </section>
   <section className="rv-section"><h2>โครงการที่ได้รับจัดสรรจากเงินกองนี้</h2><p>แสดงต่างหากจากโครงการหลักตามบัญชี 10 โครงการ</p>
    {error?<p>ไม่สามารถแสดงรายการจัดสรรได้</p>:projects.length===0?<p>ยังไม่มีโครงการที่ได้รับจัดสรร</p>:
      <div className="rv-projects">{projects.map(p=><article key={p.code}><div className="rv-proj-head">
        <div><span>{p.code}</span><h3>{p.name}</h3></div><strong>{fmt(p.budget)} บาท</strong>
      </div><div className="rv-finances"><span>PO คงค้าง <b>{fmt(p.po)}</b></span><span>เบิกจ่ายสะสม <b>{fmt(p.disbursed)}</b></span><span>คงเหลือยังไม่เบิกจ่าย <b>{fmt(p.remaining)}</b></span></div>
      <ul>{allocations.filter(t=>t.project_code===p.code).map((t,i)=><li key={i}>
       <span>{t.activity_name} · {t.agency||'ไม่ระบุหน่วยดำเนินการ'}</span>
       <b>{fmt(Number(t.amount))} บาท</b>
      </li>)}</ul></article>)}</div>}
   </section>
   <footer className="rv-bottom"><Link href="/">ย้อนกลับหน้า Dashboard</Link><span>หมายเหตุ: ยอดคงเหลือกองเงินยังไม่จัดสรร ไม่ใช่ยอดเบิกจ่ายของโครงการ</span></footer>
 </main>;
}
