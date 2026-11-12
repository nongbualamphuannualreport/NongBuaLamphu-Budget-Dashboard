import type { Metadata } from 'next';
import './globals.css';
import './disbursement.css';
import './project-hierarchy.css';
import './print-report.css';
export const metadata:Metadata={title:'รายงานผลการเบิกจ่ายจังหวัดหนองบัวลำภู ปี 2570',description:'รายงานผลการเบิกจ่ายงบประมาณจังหวัดหนองบัวลำภู พร้อมรายละเอียดรายโครงการและกิจกรรมย่อย'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="th"><body>{children}</body></html>}
