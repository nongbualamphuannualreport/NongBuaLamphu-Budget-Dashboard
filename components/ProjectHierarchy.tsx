'use client';
import {useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,FileSpreadsheet,Layers3,Landmark,Search,Wallet} from 'lucide-react';
import type {DisbursementReport,DisbursementRow} from '@/lib/disbursement';
import {moneyTH,percentTH} from '@/lib/disbursement';
import Link from 'next/link';
import {coreProject,transferredProject} from '@/lib/reallocation';
import metaFile from '@/data/hierarchy-metadata.json';

type Metadata={
  sourceFile:string;sourceDate:string;
  groups:{projectCode:string;sourceRow:number;title:string;children:number[]}[];
  sourceByRow:Record<string,{sheet:string;agencyRow:number;agencyFullName:string}>;
  breakdown:Record<string,{status:'complete'|'incomplete';rows:(string|number|null)[][]}>;
  notes:Record<string,string>;
};
const meta=metaFile as unknown as Metadata;
type Row=DisbursementRow & {source_row?:number};
type Group={id:string;order:number;title:string;children:Row[]};
type Node={kind:'group';group:Group;order:number}|{kind:'activity';row:Row;order:number};
const money=(n:number)=>moneyTH(Number(n)||0);
const sourceRow=(row:Row):number=>{
  if(typeof row.source_row==='number')return row.source_row;
  const match=String(row.code??'').match(/FY2570-R(\d+)/);
  return match?Number(match[1]):Number.MAX_SAFE_INTEGER;
};
const cleanName=(name:string)=>name.replace(/^\s*กิจกรรม(?:ย่อย)?\s*:\s*/,'').trim();
function sum(rows:Row[],field:'budget'|'po'|'disbursed'|'remaining'){return rows.reduce((total,row)=>total+(Number(row[field])||0),0);}
function Amounts({budget,po,paid,remaining}:{budget:number;po:number;paid:number;remaining:number}){
  return <div className="ph-amounts"><span><small>งบประมาณ</small><strong>{money(budget)}</strong></span><span><small>PO</small><strong className="ph-po">{money(po)}</strong></span><span><small>เบิกจ่ายแล้ว</small><strong className="ph-paid">{money(paid)}</strong></span><span><small>คงเหลือ</small><strong>{money(remaining)}</strong></span><span><small>ร้อยละ</small><strong>{percentTH(paid,budget)}%</strong></span></div>;
}
function Activity({row,nested,open,onClick}:{row:Row;nested:boolean;open:boolean;onClick:()=>void}){
  const key=String(sourceRow(row));
  const detail=meta.sourceByRow[key];
  const cost=meta.breakdown[key];
  const note=meta.notes[key];
  return <article className={'ph-activity '+(open?'is-open':'')}>
    <button type="button" className="ph-activity-trigger" onClick={onClick} aria-expanded={open}>
      {open?<ChevronDown size={18}/>:<ChevronRight size={18}/>}
      <div className="ph-activity-title"><span>{nested?'กิจกรรมย่อย':'กิจกรรม'}</span><strong>{cleanName(row.activity??row.name??'ไม่ระบุชื่อกิจกรรม')}</strong><small>หน่วยดำเนินการ: {row.agency||detail?.agencyFullName||'ไม่ระบุ'}</small></div>
      <div className="ph-activity-quick"><b>{money(row.po)} บาท PO</b><small>เบิกจ่าย {money(row.disbursed)} บาท · · {percentTH(row.disbursed,row.budget)}%</small></div>
    </button>
    {open&&<div className="ph-activity-detail">
      <Amounts budget={row.budget} po={row.po} paid={row.disbursed} remaining={row.remaining}/>
      <div className="ph-source"><FileSpreadsheet size={17}/><div><b>เอกสารอ้างอิง</b><p>{detail?`ชีต ${detail.sheet} · ${detail.agencyFullName} · แถว ${detail.agencyRow}`:'รายการที่บันทึกเพิ่มในระบบ / ไม่มีชีตหน่วยงานที่เชื่อมไว้ในไฟล์ตั้งต้น'}{sourceRow(row)!==Number.MAX_SAFE_INTEGER?` · ชีตสรุป แถว ${sourceRow(row)}`:''}</p></div></div>
      {cost&&<section className="ph-costs">
        <div className="ph-costs-head"><h4>รายการค่าใช้จ่ายตามชีตหน่วยงาน</h4><span>ข้อมูลประกอบ</span></div>
        {cost.rows.map(([label,budget,agencyRow],index)=><div className="ph-cost-row" key={index}><div>{label}<small>แถว {agencyRow} ของชีต {detail?.sheet}</small></div><b>{typeof budget==='number'?`${money(budget)} บาท`:'ยังไม่ระบุวงเงิน'}</b></div>)}
        {cost.status==='incomplete'&&<p className="ph-cost-warning">ชีตนี้มีชื่อรายการค่าใช้จ่ายบางรายการที่ยังไม่ระบุวงเงิน จึงไม่ควรตีความว่าแจกแจงงบประมาณครบแล้ว</p>}
      </section>}
      {note&&<div className="ph-note"><b>หมายเหตุจากชีตหน่วยงาน</b> {note}</div>}
    </div>}
  </article>;
}
export function ProjectHierarchy({report,search}:{report:DisbursementReport;search:string}){
  const [opened,setOpened]=useState('');
  const [openedGroup,setOpenedGroup]=useState('');
  const [openedActivity,setOpenedActivity]=useState('');
  const projects=report.projects.filter(p=>coreProject(String(p.code)));
  const extraProjects=report.projects.filter(p=>p.code!=='RESERVE'&&!coreProject(String(p.code)));
  const reserve=report.projects.find(p=>p.code==='RESERVE');
  const q=search.toLocaleLowerCase('th-TH').trim();
  const grouped=useMemo(()=>projects.map(project=>{
    const code=String(project.code??'');
    const rows=(report.activities as Row[]).filter(row=>row.project_code===code);
    const groups=meta.groups.filter(g=>g.projectCode===code);
    const used=new Set<number>();
    const nodes:Node[]=groups.map(group=>{
      const children=rows.filter(row=>group.children.includes(sourceRow(row)));
      for(const child of children)used.add(sourceRow(child));
      return {kind:'group' as const,group:{id:code+'-'+group.sourceRow,order:group.sourceRow,title:group.title,children},order:group.sourceRow};
    }).filter(node=>node.group.children.length);
    for(const row of rows)if(!used.has(sourceRow(row)))nodes.push({kind:'activity' as const,row,order:sourceRow(row)});
    nodes.sort((a,b)=>a.order-b.order);
    const text=[project.name,...rows.flatMap(row=>[row.activity,row.agency])].join(' ').toLocaleLowerCase('th-TH');
    const visible=!q||text.includes(q);
    const exactProject=(project.name??'').toLocaleLowerCase('th-TH').includes(q);
    const filteredNodes=q&&!exactProject?nodes.filter(node=>node.kind==='activity'?
       [node.row.activity,node.row.agency].some(v=>String(v??'').toLocaleLowerCase('th-TH').includes(q)):
       node.group.title.toLocaleLowerCase('th-TH').includes(q)||node.group.children.some(row=>[row.activity,row.agency].some(v=>String(v??'').toLocaleLowerCase('th-TH').includes(q)))):nodes;
    return {project,code,rows,nodes:filteredNodes,visible};
  }),[report,search,q]);
  const shown=grouped.filter(item=>item.visible);
  return <div className="ph-wrap">
    <div className="ph-intro"><div><h3><Layers3 size={20}/> โครงการตามแผนปฏิบัติราชการประจำปีงบประมาณ พ.ศ. 2570</h3><p>เลือกโครงการเพื่อดูรายละเอียดระดับกิจกรรมและกิจกรรมย่อย รวมทั้งวงเงิน ผลเบิกจ่ายสะสม และหน่วยดำเนินการ</p></div>
      <span className="ph-count"><Landmark size={17}/> {projects.length} โครงการ</span></div>
    {shown.length===0&&<div className="ph-no-results"><Search size={19}/> ไม่พบโครงการหรือกิจกรรมที่ตรงกับการค้นหา</div>}
    {shown.map(({project,code,rows,nodes})=>{
      const expanded=!!q||opened===code;
      const tally={budget:sum(rows,'budget'),paid:sum(rows,'disbursed'),po:sum(rows,'po'),remaining:sum(rows,'remaining')};
      const discrep=Math.abs(tally.budget-(Number(project.budget)||0))>1.01||Math.abs(tally.paid-(Number(project.disbursed)||0))>1.01;
      return <section className={'ph-project '+(expanded?'is-open':'')} key={code}>
        <button type="button" className="ph-project-trigger" onClick={()=>setOpened(expanded&&!q?'':code)} aria-expanded={expanded}>
          <span className="ph-project-number">{code.replace('P','')}</span>
          <div className="ph-project-name"><strong>{project.name}</strong><small>{nodes.length} กิจกรรมหลัก/รายการ · {rows.length} กิจกรรมและกิจกรรมย่อย</small></div>
          <div className="ph-project-money"><small>งบประมาณรวม</small><b>{money(project.budget)} บาท</b><small>PO {money(project.po)} บาท · เบิกจ่าย {money(project.disbursed)} บาท ({percentTH(project.disbursed,project.budget)}%)</small></div>
          {expanded?<ChevronDown className="ph-chevron" size={22}/>:<ChevronRight className="ph-chevron" size={22}/>}
        </button>
        {expanded&&<div className="ph-project-body">
          {discrep&&<p className="ph-cost-warning">ยอดรวมรายกิจกรรมของโครงการนี้ไม่ตรงกับยอดโครงการ กรุณาตรวจสอบข้อมูลต้นทางก่อนนำไปใช้ออกรายงาน</p>}
          <Amounts budget={project.budget} po={project.po} paid={project.disbursed} remaining={project.remaining}/>
          {nodes.map(node=>{
            if(node.kind==='activity'){const id=String(node.row.code??node.row.activity);return <Activity key={id} row={node.row} nested={false} open={openedActivity===id||!!q} onClick={()=>setOpenedActivity(openedActivity===id?'':id)}/>;}
            const group=node.group;const groupOpen=openedGroup===group.id||!!q;
            return <section className="ph-group" key={group.id}>
              <button className="ph-group-trigger" type="button" onClick={()=>setOpenedGroup(groupOpen&&!q?'':group.id)} aria-expanded={groupOpen}>
                {groupOpen?<ChevronDown size={18}/>:<ChevronRight size={18}/>}
                <div><span>กิจกรรมหลัก</span><strong>{group.title}</strong><small>{group.children.length} กิจกรรมย่อย</small></div>
                <b>{money(sum(group.children,'budget'))} บาท</b>
              </button>
              {groupOpen&&<div className="ph-group-body">
                <div className="ph-group-totals"><span>PO {money(sum(group.children,'po'))} บาท · เบิกจ่ายแล้ว {money(sum(group.children,'disbursed'))} บาท</span><span>คงเหลือ {money(sum(group.children,'remaining'))} บาท</span></div>
                {group.children.map(child=>{const id=String(child.code??child.activity);return <Activity key={id} row={child} nested open={openedActivity===id||!!q} onClick={()=>setOpenedActivity(openedActivity===id?'':id)}/>;})}
              </div>}
            </section>;
          })}
        </div>}
      </section>;
    })}
    {extraProjects.length>0&&<section className="ph-extras">
      <h3>โครงการเพิ่มเติมนอกบัญชี 10 โครงการหลัก</h3>
      <p>แสดงตามแหล่งงบประมาณโดยไม่นำมารวมในจำนวนโครงการหลัก</p>
      {extraProjects.map(p=><div className="ph-extra-row" key={p.code}>
        <div><strong>{p.code} · {p.name}</strong><small>{transferredProject(String(p.code))?'จัดสรรจากเงินโอนเปลี่ยนแปลง':'โครงการเพิ่มเติมที่มีอยู่เดิม'}</small></div>
        <div><b>{money(p.budget)} บาท</b><small>PO {money(p.po)} · เบิกจ่าย {money(p.disbursed)}</small></div>
      </div>)}
    </section>}
    {reserve&&<Link className="ph-reserve ph-reserve-link" href="/reserve"><Wallet size={21}/><div><strong>เงินคงเหลือจากการโอนเปลี่ยนแปลง</strong><p>กองเงินแยกสำหรับสร้างโครงการใหม่ · ดูยอดที่จัดสรรไปแล้วและเงินคงเหลือ</p></div><b>{money(reserve.budget)} บาท</b><ChevronRight size={19}/></Link>}
    <p className="ph-provenance">รายละเอียดค่าใช้จ่ายอ้างอิงตามบัญชีหน่วยดำเนินการ ณ 10 พฤศจิกายน 2569 โดยไม่นับซ้ำกับยอดงบประมาณรายโครงการ</p>
  </div>;
}
