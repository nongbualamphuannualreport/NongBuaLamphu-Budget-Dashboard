import test from 'node:test';
import assert from 'node:assert/strict';
import {paginatePdfProjectDetails,type PdfProject,type PdfActivity} from '../lib/pdf-project-pages';
const p=(code:string):PdfProject=>({code,name:'โครงการพัฒนาการเกษตรและส่งเสริมเศรษฐกิจ',budget:1000,paid:100,remaining:900});
const a=(code:string,i:number):PdfActivity=>({
 id:code+'-'+i,project_code:code,name:'กิจกรรมย่อยเพื่อเพิ่มประสิทธิภาพการเกษตรและส่งเสริมผลิตภัณฑ์ชุมชน',
 agency:'สำนักงานหน่วยดำเนินการจังหวัดหนองบัวลำภู',budget:100,cumulative:10,remaining:90
});
test('detail report includes every project once and activities grouped underneath',()=>{
 const projects=[p('P01'),p('P02'),p('RESERVE')];
 const activities=[...Array.from({length:7},(_,i)=>a('P01',i)),...Array.from({length:4},(_,i)=>a('P02',i))];
 const pages=paginatePdfProjectDetails(projects,activities);
 const all=pages.flat();
 assert.deepEqual(all.filter(x=>x.kind==='project').map(x=>x.project.code),['P01','P02','RESERVE']);
 assert.equal(all.filter(x=>x.kind==='activity').length,11);
 const seen=new Set<string>();
 let current='';
 for(const entry of all){
  if(entry.kind==='project'){assert.equal(seen.has(entry.project.code),false);seen.add(entry.project.code);current=entry.project.code;}
  else assert.equal(entry.row.project_code,current);
 }
 assert.ok(pages.length>1);
});
test('reserve is last and never receives a duplicate activity row',()=>{
 const pages=paginatePdfProjectDetails([p('RESERVE'),p('P01')],[a('P01',1),a('RESERVE',2)]);
 const all=pages.flat();
 assert.equal(all.filter(x=>x.kind==='activity').length,1);
 assert.equal(all.at(-1)?.kind,'project');
});
