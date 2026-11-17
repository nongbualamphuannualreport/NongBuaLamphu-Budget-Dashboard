import {PublicReserveShell} from '@/components/PublicReserveShell';
import './reserve.css';

// Keep the public navigation visible while the reserve report is fetched.
export default function ReserveLayout({children}:{children:React.ReactNode}){
 return <PublicReserveShell>{children}</PublicReserveShell>;
}
