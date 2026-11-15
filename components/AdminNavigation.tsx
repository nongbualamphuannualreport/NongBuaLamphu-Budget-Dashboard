'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {
  LayoutDashboard,FolderTree,FileClock,FileDown,PiggyBank,
  HandCoins,ReceiptText,Wallet,ExternalLink,Menu,X,UserRound,RefreshCw,LogOut
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import './admin-navigation.css';

export type AdminView='overview'|'projects'|'po'|'disbursements'|'history'|'pdf'|'savings';
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
  {id:'savings',label:'เงินเหลือจ่ายจากโครงการ',hint:'บันทึกเงินเหลือจ่ายที่ยืนยันแล้ว',Icon:PiggyBank},
  {id:'reserve',label:'เงินโอนเปลี่ยนแปลง',hint:'จัดสรร สร้างโครงการ และคืนเงิน',Icon:Wallet},
  {id:'pdf',label:'ดาวน์โหลดรายงาน',hint:'รายงานสำหรับเจ้าหน้าที่',Icon:FileDown},
 ]}
];
const titles=Object.fromEntries(GROUPS.flatMap(g=>g.items.map(i=>[i.id,i.label])));
type Props={
 active:AdminView|'reserve';
 onSelect?:(view:AdminView)=>void;
 onLogout?:()=>void|Promise<void>;
 onRefresh?:()=>void|Promise<void>;
 refreshing?:boolean;
};
export function AdminNavigation({active,onSelect,onLogout,onRefresh,refreshing=false}:Props){
 const [expanded,setExpanded]=useState(false);
 const [accountOpen,setAccountOpen]=useState(false);
 const drawerRef=useRef<HTMLElement>(null);
 const toggleRef=useRef<HTMLButtonElement>(null);
 const accountRef=useRef<HTMLDivElement>(null);
 const label=titles[active]??'เมนูจัดการ';
 useEffect(()=>{
   if(!expanded&&!accountOpen)return;
   const key=(event:KeyboardEvent)=>{
    if(event.key==='Escape'){setExpanded(false);setAccountOpen(false);toggleRef.current?.focus();}
    if(event.key==='Tab'&&expanded&&window.matchMedia('(max-width:1100px)').matches){
      const focusables=Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')??[]);
      const first=focusables[0],last=focusables[focusables.length-1];
      if(first&&last&&event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(first&&last&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
   };
   document.addEventListener('keydown',key);
   const previous=document.body.style.overflow;
   if(expanded&&window.matchMedia('(max-width:1100px)').matches){
      document.body.style.overflow='hidden';
      drawerRef.current?.querySelector<HTMLButtonElement>('.an-drawer-close')?.focus();
   }
   const click=(event:MouseEvent)=>{if(accountOpen&&accountRef.current&&!accountRef.current.contains(event.target as Node))setAccountOpen(false);};
   document.addEventListener('mousedown',click);
   return ()=>{document.removeEventListener('keydown',key);document.removeEventListener('mousedown',click);document.body.style.overflow=previous;};
 },[expanded,accountOpen]);
 const close=()=>setExpanded(false);
 const refresh=()=>{setAccountOpen(false);void onRefresh?.();};
 const logout=()=>{setAccountOpen(false);setExpanded(false);void onLogout?.();};
 return <>
  <div className="an-mobile-bar mon-noprint" aria-label="แถบนำทางสำหรับมือถือ">
    <button ref={toggleRef} type="button" className="an-mobile-menu" aria-expanded={expanded} aria-controls="an-menu-list" aria-label="เปิดเมนูหลัก" onClick={()=>{setAccountOpen(false);setExpanded(true);}}><Menu size={21}/><span>เมนู</span></button>
    <div className="an-mobile-title"><strong>จัดการงบประมาณ</strong><small>{label}</small></div>
    <div className="an-mobile-account" ref={accountRef}>
      <button type="button" className="an-account-trigger" aria-expanded={accountOpen} aria-label="เปิดเมนูบัญชีผู้ใช้" onClick={()=>{setExpanded(false);setAccountOpen(v=>!v);}}><UserRound size={20}/><span>บัญชี</span></button>
      {accountOpen&&<div className="an-account-popover" role="group" aria-label="เครื่องมือบัญชีผู้ใช้">
        <strong>การจัดการบัญชี</strong>
        <button type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={18}/> แสดงข้อมูลล่าสุด</button>
        <button type="button" onClick={logout}><LogOut size={18}/> ออกจากระบบ</button>
      </div>}
    </div>
  </div>
  {expanded&&<button type="button" className="an-mobile-backdrop mon-noprint" aria-label="ปิดเมนูหลัก" onClick={close}/>}
  <aside ref={drawerRef} className={'an-sidebar mon-noprint'+(expanded?' an-mobile-open':'')} aria-label="แถบเมนูระบบจัดการงบประมาณ">
    <div className="an-brand">
      <span className="an-brand-mark">นภ</span>
      <div><strong>จัดการงบประมาณ</strong><small>จังหวัดหนองบัวลำภู · พ.ศ. 2570</small></div>
      <button className="an-drawer-close" type="button" aria-label="ปิดเมนู" onClick={close}><X size={20}/></button>
    </div>
    <nav className="an-list" id="an-menu-list" aria-label="เมนูส่วนงาน">
      {GROUPS.map(group=><section className="an-group" key={group.heading}>
        <p className="an-group-heading">{group.heading}</p>
        {group.items.map(({id,label:caption,hint,Icon})=>{
          const selected=active===id;
          const contents=<><Icon size={20} aria-hidden="true"/><span><strong>{caption}</strong><small>{hint}</small></span>{selected&&<span className="an-active-marker" aria-hidden="true"/>}</>;
          if(id==='reserve')return <Link className={'an-item'+(selected?' an-selected':'')} href="/admin/reserve" key={id}
            aria-current={selected?'page':undefined} onClick={close}>{contents}</Link>;
          if(!onSelect)return <Link className={'an-item'+(selected?' an-selected':'')} key={id}
            href={'/admin?view='+id} aria-current={selected?'page':undefined} onClick={close}>{contents}</Link>;
          return <button type="button" key={id} className={'an-item'+(selected?' an-selected':'')}
            aria-current={selected?'page':undefined} onClick={()=>{onSelect(id);close();}}>{contents}</button>;
        })}
      </section>)}
      <div className="an-outbound"><Link href="/" onClick={close}><ExternalLink size={17}/> ดูเว็บไซต์สาธารณะ</Link></div>
      <div className="an-desktop-tools">
        <span>บัญชีผู้ใช้</span>
        <button type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={17}/> แสดงข้อมูลล่าสุด</button>
        <button type="button" onClick={logout}><LogOut size={17}/> ออกจากระบบ</button>
      </div>
    </nav>
  </aside>
 </>;
}
