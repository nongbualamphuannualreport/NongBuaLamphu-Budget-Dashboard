import Link from 'next/link';
import { AdminEditor } from '@/components/AdminEditor';
export default function AdminPage(){return <><nav style={{background:'#eaf5ed',padding:'13px 5%',display:'flex',gap:24,flexWrap:'wrap'}}><strong>ระบบหลังบ้าน</strong><Link href="/admin/monitor" style={{color:'#0b7658',fontWeight:700}}>รายงานเบิกจ่ายรายวัน / เดือน / ปี และแก้ไขกิจกรรมย่อย →</Link><Link href="/admin/disbursement">นำเข้า Excel</Link></nav><AdminEditor/></>}
