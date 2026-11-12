import {redirect} from 'next/navigation';
export default function LegacyReportRoute(){
  // Reports are available exclusively to authenticated staff through /admin.
  redirect('/admin');
}
