'use client';
import Link from 'next/link';
import {useState} from 'react';
import {
  LayoutDashboard,FolderTree,FileClock,FileDown,
  HandCoins,ReceiptText,Wallet,ExternalLink,Menu,ChevronDown
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import './admin-navigation.css';

export type AdminView='overview'|'projects'|'po'|'disbursements'|'history'|'pdf';
type NavItem={id:AdminView|'reserve';label:string;hint:string;Icon:LucideIcon};
const GROUPS:{heading:string;items:NavItem[]}[]=[
 {heading:'ภาพรวมและข้อมูล',items:[
  {id:'overview',label:'ภาพรวมงบประมาณ',hint:'ยอดงบ PO และผลเบิกจ่าย',Icon:LayoutDashboard},
  {id:'projects',label:'โครงการและกิจกรรม',hint:'วงเงินและหน่วยดำเนินการ',Icon:FolderTree},
 ]},
 {heading:'บันทึกการดำเนินงาน',items:[
  {id:'po',label:'PO / ยอดผูกพัน',hint:'สัญญา ลด PO และจ่ายจาก PO',Icon:HandCoins},
  {id:'disbursements',label:'บันทึกเบิกจ่าย',hint:'เพิ่มยอดและลดยอดเบิกจ่าย',Icon:ReceiptText},
  {id:'history',label:'ประวัติเบิกจ่าย',hint:'ตรวจสอบและแก้ไขรายการ',Icon:FileClock},
 ]},
 {heading:'กองเงินและรายงาน',items:[
  {id:'reserve',label:'เงินโอนเปลี่ยนแปลง',hint:'จัดสรร สร้างโครงการ และคืนเงิน',Icon:Wallet},
  {id:'pdf',label:'ดาวน์โหลดรายงาน',hint:'รายงานสำหรับเจ้าหน้าที่',Icon:FileDown},
 ]}
];
const titles=Object.fromEntries(GROUPS.flatMap(g=>g.items.map(i=>[i.id,i.label])));
export function AdminNavigation({active,onSelect}:{active:AdminView|'reserve';onSelect?:(view:AdminView)=>void}){
 const [expanded,setExpanded]=useState(false);
 const label=titles[active]??'เมนูจัดการ';
 return <aside className="an-sidebar mon-noprint" aria-label="แถบเมนูระบบจัดการงบประมาณ">
   <div className="an-brand"><span className="an-brand-mark">NB</span><div>
     <strong>จัดการงบประมาณ</strong><small>ระบบจัดการงบประมาณ พ.ศ. 2570</small>
   </div></div>
   <button className="an-toggle" type="button" aria-expanded={expanded} aria-controls="an-menu-list"
     onClick={()=>setExpanded(!expanded)}>
     <Menu size={19}/><span>{label}</span><ChevronDown size={17} className={expanded?'an-chevron-open':''}/>
   </button>
   <div className={'an-list'+(expanded?' an-open':'')} id="an-menu-list">
    {GROUPS.map(group=><section className="an-group" key={group.heading}>
      <p className="an-group-heading">{group.heading}</p>
      {group.items.map(({id,label:caption,hint,Icon})=>{
        const selected=active===id;
        const children=<><Icon size={20} aria-hidden="true"/><span><strong>{caption}</strong><small>{hint}</small></span>{selected&&<span className="an-active-marker" aria-hidden="true"/>}</>;
        if(id==='reserve')return <Link className={'an-item'+(selected?' an-selected':'')} href="/admin/reserve" key={id}
          aria-current={selected?'page':undefined} onClick={()=>setExpanded(false)}>{children}</Link>;
        if(!onSelect)return <Link className={'an-item'+(selected?' an-selected':'')} key={id}
          href={'/admin?view='+id} onClick={()=>setExpanded(false)}>{children}</Link>;
        return <button type="button" key={id} className={'an-item'+(selected?' an-selected':'')}
          aria-current={selected?'page':undefined} onClick={()=>{onSelect(id);setExpanded(false)}}>{children}</button>;
      })}
    </section>)}
    <div className="an-outbound"><Link href="/"><ExternalLink size={17}/> ดูเว็บไซต์สาธารณะ</Link></div>
   </div>
 </aside>;
}
