import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  // Old public PDF links must never expose printable files.
  return NextResponse.redirect(new URL('/report',request.url),{
    status:307,headers:{'Cache-Control':'no-store'}
  });
}
