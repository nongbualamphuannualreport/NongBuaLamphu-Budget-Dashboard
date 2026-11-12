import {NextRequest,NextResponse} from 'next/server';
export const dynamic='force-dynamic';

/** Temporary compatibility redirect while the PDF renderer is being replaced.
 * Old shared PDF links open the readable online report rather than a corrupt document.
 */
export async function GET(request:NextRequest){
  const mode=request.nextUrl.searchParams.get('mode')==='full'?'full':'summary';
  const destination=new URL('/report',request.url);
  destination.searchParams.set('mode',mode);
  const date=request.nextUrl.searchParams.get('date');
  if(date)destination.searchParams.set('date',date);
  return NextResponse.redirect(destination,{status:307,headers:{'Cache-Control':'no-store'}});
}
