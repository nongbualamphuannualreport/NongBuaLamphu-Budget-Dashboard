import Link from 'next/link';
import './report.css';
export const dynamic='force-dynamic';
export default function LegacyReportRoute(){
 return <main className="mr-page mr-legacy-page">
   <section className="mr-legacy-panel">
     <h1>รายงานสำหรับเจ้าหน้าที่</h1>
     <p>เจ้าหน้าที่สามารถดาวน์โหลดรายงานได้จากเมนูรายงานและ PDF ในระบบหลังบ้าน</p>
     <Link className="mr-legacy-back" href="/admin?view=pdf">ไปยังหน้ารายงาน</Link>
   </section>
 </main>;
}
