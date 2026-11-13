'use client';
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import {Menu,X,PanelLeftClose,PanelLeftOpen,LayoutDashboard,FolderTree,ListTree,FolderPlus,Wallet,Download,LockKeyhole} from 'lucide-react';
export function PublicReserveShell({children}:{children:ReactNode}){
 const [menuOpen,setMenuOpen]=useState(false);
 const [menuCollapsed,setMenuCollapsed]=useState(false);
 const nav=[{href:'/?view=overview',label:'แดชบอร์ด',Icon:LayoutDashboard},{href:'/?view=projects',label:'โครงการหลัก 10 โครงการ',Icon:FolderTree},{href:'/?view=activities',label:'กิจกรรมย่อย',Icon:ListTree},{href:'/?view=extras',label:'โครงการที่เพิ่มภายหลัง',Icon:FolderPlus}];
 return <main className="ds-wrap"><div className={'ds-screen ds-shell'+(menuCollapsed?' ds-shell-collapsed':'')}>
 {menuOpen&&<button type="button" className="ds-sidebar-backdrop" aria-label="ปิดเมนู" onClick={()=>setMenuOpen(false)}/>}
 <aside className={'ds-sidebar'+(menuOpen?' ds-sidebar-open':'')} aria-label="เมนูรายงานงบประมาณ">
 <div className="ds-sidebar-head"><span className="ds-mark">นภ</span><div className="ds-sidebar-brand"><strong>Budget Dashboard</strong><small>ปีงบประมาณ พ.ศ. 2570</small></div><button type="button" className="ds-sidebar-collapse" onClick={()=>setMenuCollapsed(v=>!v)} aria-label={menuCollapsed?'ขยายเมนูด้านซ้าย':'ย่อเมนูด้านซ้าย'} title={menuCollapsed?'ขยายเมนู':'ย่อเมนู'} aria-expanded={!menuCollapsed}>{menuCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button><button type="button" className="ds-sidebar-close" onClick={()=>setMenuOpen(false)} aria-label="ปิดเมนู"><X size={19}/></button></div>
 <div className="ds-sidebar-group">ภาพรวมและโครงการ</div>
 {nav.map(({href,label,Icon})=><Link key={href} href={href} className="ds-sidebar-link" title={label} onClick={()=>setMenuOpen(false)}><Icon size={19}/><span>{label}</span></Link>)}
 <div className="ds-sidebar-group">บริหารเงินโอนเปลี่ยนแปลง</div>
 <Link href="/reserve" className="ds-sidebar-link active" title="เงินคงเหลือจากการโอนเปลี่ยนแปลง" aria-current="page" onClick={()=>setMenuOpen(false)}><Wallet size={19}/><span>เงินคงเหลือจากการโอนเปลี่ยนแปลง</span></Link>
 <div className="ds-sidebar-group">รายงานและจัดการ</div>
 <Link href="/?view=reports" className="ds-sidebar-link" title="รายงานและส่งออกข้อมูล" onClick={()=>setMenuOpen(false)}><Download size={19}/><span>รายงานและส่งออกข้อมูล</span></Link>
 <Link href="/admin" className="ds-sidebar-link" title="ระบบสำหรับเจ้าหน้าที่" onClick={()=>setMenuOpen(false)}><LockKeyhole size={19}/><span>ระบบสำหรับเจ้าหน้าที่</span></Link>
 </aside>
 <div className="ds-shell-main"><header className="ds-top"><div className="ds-top-inner"><div className="ds-menu-controls"><button type="button" className="ds-menu-mobile" aria-label="เปิดเมนูด้านซ้าย" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Menu size={21}/></button></div><div className="ds-brand"><span className="ds-mark">นภ</span><div><strong>รายงานผลการเบิกจ่ายงบประมาณ</strong><small>จังหวัดหนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</small></div></div><nav><Link href="/admin"><LockKeyhole size={15}/> เข้าสู่ระบบเจ้าหน้าที่</Link></nav></div></header><div className="ds-content">{children}</div></div>
 </div></main>;
}
