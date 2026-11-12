import Link from 'next/link';
import './report.css';
export const dynamic='force-dynamic';
export default function LegacyReportRoute(){
 return <main className="mr-page mr-legacy-page">
   <section className="mr-legacy-panel">
     <h1>รายงาน PDF สำหรับเจ้าหน้าที่</h1>
     <p>การดาวน์โหลดรายงานสรุปและรายงานรายละเอียดได้ย้ายไปอยู่ในระบบหลังบ้านแล้ว เพื่อให้เจ้าหน้าที่จัดทำรายงานเมื่อมีการร้องขอ</p>
     <Link className="mr-legacy-back" href="/">ย้อนกลับ</Link>
   </section>
 </main>;
}
