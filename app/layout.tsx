import type {Metadata} from 'next';
import './globals.css';
import './disbursement.css';
export const metadata:Metadata={title:'รายงานงบประมาณจังหวัดหนองบัวลำภู ปี 2570',description:'Dashboard รายงานผลการเบิกจ่ายและจัดสรรงบประมาณจังหวัดหนองบัวลำภู'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="th"><body>{children}</body></html>}
