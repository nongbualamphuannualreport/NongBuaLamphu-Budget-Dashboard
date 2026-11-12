import Link from 'next/link';
import {getPublicReport,requestedCutoff} from '@/lib/public-report';
import {moneyTH,percentTH} from '@/lib/disbursement';
import './report.css';
export const dynamic='force-dynamic';
const dateTH=(d:string)=>new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(d+'T12:00:00+07:00'));
const todayTH=()=>new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date());
export default async function ReportPage({searchParams}:{searchParams:Promise<{mode?:string;date?:string}>}){
 const params=await searchParams;
 const mode=params.mode==='full'?'full':'summary';
 let cutoff:string;
 try{cutoff=requestedCutoff(params.date??null);}catch{return <main className="mr-page"><h1>วันที่ไม่ถูกต้อง</h1><Link href="/">กลับหน้า Dashboard</Link></main>;}
 const {report,preview}=await getPublicReport(cutoff);
 if(!report)return <main className="mr-page"><h1>ไม่พบข้อมูลสำหรับวันที่เลือก</h1><Link href="/">กลับหน้า Dashboard</Link></main>;
 const search=new URLSearchParams({mode});
 if(params.date)search.set('date',cutoff);
 const base='/api/pdf?'+search.toString();
 const actualProjects=report.projects.filter(x=>x.code!=='RESERVE');
 const paidProjects=actualProjects.filter(x=>x.disbursed>0);
 return <main className="mr-page">
   <header className="mr-top"><div><Link className="mr-back" href="/">← กลับหน้า Dashboard</Link><span>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</span></div><nav><Link href={base} target="_blank" rel="noopener noreferrer">เปิด PDF</Link><Link className="mr-download" href={base+'&download=1'}>ดาวน์โหลด PDF</Link></nav></header>
   <article className="mr-paper">
     <section className="mr-hero">
       <span className="mr-pill">รายงานผลการเบิกจ่าย</span>
       <h1>ผลการเบิกจ่ายงบประมาณจังหวัดหนองบัวลำภู</h1>
       <p>ประจำปีงบประมาณ พ.ศ. 2570</p>
       <strong>{moneyTH(report.totals.budget)} <small>บาท</small></strong>
     </section>
     <div className="mr-date"><strong>วันที่จัดทำรายงาน {todayTH()}</strong><span>ข้อมูลเบิกจ่าย ณ {dateTH(report.as_of_date)}</span></div>
     
     <section className="mr-stat-grid">
       <div><span>เบิกจ่ายสะสม</span><strong>{moneyTH(report.totals.disbursed)}</strong><small>บาท</small></div>
       <div><span>คงเหลือยังไม่เบิกจ่าย</span><strong>{moneyTH(report.totals.remaining)}</strong><small>บาท</small></div>
       <div><span>อัตราการเบิกจ่าย</span><strong>{percentTH(report.totals.disbursed,report.totals.budget)}%</strong><small>ของงบประมาณ</small></div>
     </section>
     <section className="mr-section">
       <div className="mr-section-title"><h2>ความก้าวหน้าการเบิกจ่าย</h2><strong>{percentTH(report.totals.disbursed,report.totals.budget)}%</strong></div>
       <div className="mr-progress"><div style={{width:Math.min(100,Math.max(0,report.totals.budget?report.totals.disbursed/report.totals.budget*100:0))+'%'}}/></div>
     </section>
     <section className="mr-status"><strong>สถานะรายโครงการ</strong><div><b>{actualProjects.length}</b><span>โครงการ</span></div><div><b>{paidProjects.length}</b><span>เริ่มเบิกจ่าย</span></div><div><b>{actualProjects.length-paidProjects.length}</b><span>ยังไม่เบิกจ่าย</span></div></section>
     {mode==='summary'?<section className="mr-section"><h2>โครงการที่มีการเบิกจ่าย</h2>{paidProjects.sort((a,b)=>b.disbursed-a.disbursed).map((p,i)=><div key={p.code??i} className="mr-summary-row"><span>{i+1}</span><strong>{p.name}</strong><b>{moneyTH(p.disbursed)} บาท</b></div>)}</section>:<>
       <section className="mr-section"><h2>ผลการเบิกจ่ายรายโครงการ</h2>{report.projects.map((p,i)=><div key={p.code??i} className="mr-data-card"><strong>{p.name??p.activity??'เงินเหลือจ่าย'}</strong><div><span>งบประมาณ <b>{moneyTH(p.budget)}</b></span><span>เบิกจ่าย <b>{moneyTH(p.disbursed)}</b></span><span>คงเหลือ <b>{moneyTH(p.remaining)}</b></span></div></div>)}</section>
       <section className="mr-section"><h2>ผลการเบิกจ่ายรายกิจกรรมย่อย</h2>{report.activities.map((a,i)=><div key={a.code??i} className="mr-data-card"><strong>{a.activity??a.name??'กิจกรรม'}</strong><small>{a.agency??'ไม่ระบุหน่วยดำเนินการ'}</small><div><span>งบประมาณ <b>{moneyTH(a.budget)}</b></span><span>เบิกจ่าย <b>{moneyTH(a.disbursed)}</b></span><span>คงเหลือ <b>{moneyTH(a.remaining)}</b></span></div></div>)}</section>
     </>}
   </article>
   <div className="mr-bottom"><Link href={base} target="_blank" rel="noopener noreferrer">เปิด PDF</Link><Link href={base+'&download=1'} className="mr-download">ดาวน์โหลด PDF</Link><Link href="/">กลับ Dashboard</Link></div>
   <p className="mr-help">หากดู PDF ผ่าน Messenger ไม่ได้ ให้เปิดเมนู ••• ของ Messenger แล้วเลือกเปิดใน Safari หรือ Chrome หรืออ่านรายงานบนหน้านี้ได้ทันที</p>
 </main>;
}
