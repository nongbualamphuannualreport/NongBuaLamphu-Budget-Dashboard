import {validateDisbursement, type DisbursementReport, type DisbursementRow} from './disbursement';

// Standalone OOXML (.xlsx) reader for the provincial disbursement ledger.
// Uses browser-native ZIP decompression. No CDN, uploads, or external JS dependencies.
const bytesToText = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);
const norm = (s: unknown) => String(s ?? '').replace(/\s+/g,' ').trim();
const num = (v: unknown) => {
  if (typeof v==='number') return Number.isFinite(v) ? v : NaN;
  const str=String(v??'').replace(/[,\s฿]/g,'');
  if (!str || str==='-') return 0;
  const x=Number(str); return Number.isFinite(x)?x:NaN;
};
const u16=(v:DataView,o:number)=>v.getUint16(o,true);
const u32=(v:DataView,o:number)=>v.getUint32(o,true);

async function zipEntries(input:ArrayBuffer):Promise<Map<string,Uint8Array>> {
  const view=new DataView(input);const bytes=new Uint8Array(input);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(view,i)===0x06054b50){end=i;break;}}
  if(end<0)throw Error('ไฟล์นี้ไม่ใช่ Excel .xlsx ที่ถูกต้อง');
  const count=u16(view,end+10),offset=u32(view,end+16);
  if(count>1000 || offset>=bytes.length)throw Error('โครงสร้าง XLSX ใหญ่หรือผิดปกติ');
  const result=new Map<string,Uint8Array>();let p=offset;
  for(let i=0;i<count;i++){
    if(p+46>bytes.length||u32(view,p)!==0x02014b50)throw Error('ZIP directory ไม่ถูกต้อง');
    const method=u16(view,p+10), size=u32(view,p+20),nameLength=u16(view,p+28),extra=u16(view,p+30),comment=u16(view,p+32),local=u32(view,p+42);
    const name=bytesToText(bytes.subarray(p+46,p+46+nameLength)); p+=46+nameLength+extra+comment;
    if(!/^(xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)|docProps\/)/.test(name))continue;
    if(size>12_000_000 || local+30>bytes.length || u32(view,local)!==0x04034b50)throw Error('ไฟล์ XLSX มีข้อมูลผิดปกติ');
    const start=local+30+u16(view,local+26)+u16(view,local+28);
    if(start+size>bytes.length)throw Error('ข้อมูล ZIP ไม่ครบ');
    const compressed=bytes.subarray(start,start+size);
    let decoded:Uint8Array;
    if(method===0)decoded=compressed;
    else if(method===8){
      if(typeof DecompressionStream==='undefined')throw Error('เบราว์เซอร์ไม่รองรับการอ่าน Excel กรุณาใช้ Chrome หรือ Edge รุ่นล่าสุด');
      try{
        const ds=new DecompressionStream('deflate-raw');
        const stream=new Blob([Uint8Array.from(compressed)]).stream().pipeThrough(ds);
        decoded=new Uint8Array(await new Response(stream).arrayBuffer());
      }catch{throw Error('ไม่สามารถคลายข้อมูล XLSX ได้ กรุณาเปิดไฟล์ใหม่ด้วย Excel แล้ว Save As เป็น .xlsx');}
    }else throw Error('ไฟล์ XLSX ใช้การบีบอัดที่ไม่รองรับ');
    result.set(name,decoded);
  }
  return result;
}
function xml(text:string):Document{
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('XML ภายใน Excel ไม่ถูกต้อง');return doc;
}
function all(parent:Element|Document,tag:string):Element[]{return Array.from(parent.getElementsByTagName(tag));}
function first(parent:Element|Document,tag:string):Element|undefined{return all(parent,tag)[0];}
function sharedStrings(doc?:Document):string[]{return doc?all(doc,'si').map(si=>all(si,'t').map(t=>t.textContent??'').join('')):[];}
function workbookRows(doc:Document, shared:string[]):Map<number,Record<string,string|number>>{
  const rows=new Map<number,Record<string,string|number>>();
  for(const row of all(doc,'row')){
    const number=Number(row.getAttribute('r'));if(!number)continue;
    const data:Record<string,string|number>={};
    for(const cell of all(row,'c')){
      const col=(cell.getAttribute('r')??'').match(/^[A-Z]+/)?.[0];if(!col)continue;
      const type=cell.getAttribute('t');const raw=first(cell,'v')?.textContent??'';
      if(type==='s')data[col]=shared[Number(raw)]??'';
      else if(type==='inlineStr')data[col]=all(cell,'t').map(t=>t.textContent??'').join('');
      else if(type==='str'||type==='e')data[col]=raw;
      else if(raw!=='')data[col]=Number.isFinite(Number(raw))?Number(raw):raw;
    }
    rows.set(number,data);
  }
  return rows;
}
function extractDate(header:string):string{
  const match=header.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})/);
  if(!match)throw Error('ไม่พบวันที่รายงานในเซลล์ B2 (เช่น ณ วันที่ 10/11/2569)');
  const day=Number(match[1]),month=Number(match[2]);let year=Number(match[3]);
  if(year>2400)year-=543;
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day)throw Error('วันที่ใน Excel ไม่ถูกต้อง');
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function rowAmounts(row:Record<string,string|number>){
  const n=(col:string)=>num(row[col]);
  return {budget:n('C'),po:n('E'),disbursed_investment:n('F'),disbursed_operating:n('G'),disbursed:n('H'),spent:n('I'),surplus:n('J'),remaining:n('K')};
}
export async function importDisbursementXlsx(file:File):Promise<DisbursementReport>{
  if(!/\.xlsx$/i.test(file.name))throw Error('รองรับเฉพาะ Excel .xlsx');
  if(file.size>8_000_000)throw Error('ไฟล์ Excel ต้องไม่เกิน 8 MB');
  const entries=await zipEntries(await file.arrayBuffer());
  const workbook=entries.get('xl/workbook.xml');
  if(!workbook)throw Error('ไม่พบโครงสร้าง Workbook');
  const wb=xml(bytesToText(workbook));const sheet=all(wb,'sheet')[0];
  if(!sheet||sheet.getAttribute('name')!=='ผลการเบิกจ่าย')throw Error('ชีตแรกต้องชื่อ “ผลการเบิกจ่าย” ตามรูปแบบบัญชีจังหวัด');
  const sheetRels=entries.get('xl/_rels/workbook.xml.rels');
  let sheetPath='xl/worksheets/sheet1.xml';
  if(sheetRels){
    const relationshipId=sheet.getAttribute('r:id');
    const relation=all(xml(bytesToText(sheetRels)),'Relationship').find(r=>r.getAttribute('Id')===relationshipId);
    const path=relation?.getAttribute('Target');
    if(path)sheetPath=path.startsWith('/')?path.slice(1):`xl/${path.replace(/^\.\//,'')}`;
  }
  const bytes=entries.get(sheetPath);
  if(!bytes)throw Error('ไม่พบชีตผลการเบิกจ่ายในไฟล์');
  const strs=entries.get('xl/sharedStrings.xml');
  const rows=workbookRows(xml(bytesToText(bytes)),sharedStrings(strs?xml(bytesToText(strs)):undefined));
  const asOfDate=extractDate(norm(rows.get(2)?.B));
  const summary=rows.get(6);
  if(!summary||!norm(summary.A).includes('โครงการพัฒนาจังหวัด'))throw Error('ไม่พบแถวสรุปภาพรวมที่แถว 6 — รูปแบบไฟล์ไม่ตรงกับต้นฉบับ');
  const totalsRow=rowAmounts(summary);
  const projects:DisbursementRow[]=[];const activities:DisbursementRow[]=[];
  let current='';
  const maxRow=Math.max(...rows.keys());
  for(let index=7;index<=maxRow;index++){
    const row=rows.get(index);if(!row)continue;
    const name=norm(row.A),agency=norm(row.B);if(!name)continue;
    const fields=rowAmounts(row);
    if(name==='เงินเหลือจ่าย'){
      projects.push({code:'RESERVE',name,source_row:index,...fields} as DisbursementRow);
      current='RESERVE';continue;
    }
    if(name.startsWith('โครงการ')&&!agency){
      current=`P${String(projects.filter(p=>p.code!=='RESERVE').length+1).padStart(2,'0')}`;
      projects.push({code:current,name,source_row:index,...fields} as DisbursementRow);continue;
    }
    if(name.includes('กิจกรรม')&&!name.startsWith('กิจกรรมหลัก')&&agency&&current&&current!=='RESERVE'){
      activities.push({project_code:current,activity:name,agency,source_row:index,...fields} as DisbursementRow);
    }
  }
  if(projects.length<2||activities.length===0)throw Error('ไม่พบรายการโครงการหรือกิจกรรม — ตรวจสอบรูปแบบ Excel ที่นำเข้า');
  const result:DisbursementReport={fiscal_year:2570,as_of_date:asOfDate,report_type:'disbursement',source_file:file.name,
    totals:{budget:totalsRow.budget,po:totalsRow.po,disbursed:totalsRow.disbursed,spent:totalsRow.spent,surplus:totalsRow.surplus,remaining:totalsRow.remaining}, projects,activities};
  const {errors}=validateDisbursement(result);
  if(errors.length)throw Error('ข้อมูลใน Excel ไม่ผ่านการตรวจสอบ:\n'+errors.join('\n'));
  return result;
}
