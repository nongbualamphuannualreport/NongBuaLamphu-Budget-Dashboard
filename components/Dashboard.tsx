"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChartNoAxesCombined, Download, FileBarChart2, LockKeyhole, RefreshCcw, Search, ShieldCheck, Wallet } from "lucide-react";
import type { BudgetReport, ReportMode } from "@/lib/types";
import { compactMoney, isoDate, money, qualityWarnings, reportTotals, thaiDate } from "@/lib/report";
import { PdfPreview } from "@/components/PdfPreview";

const statusLabel = { approved: "อนุมัติแล้ว", pending: "รออนุมัติ", mixed: "อนุมัติบางส่วน", reserve: "เงินเหลือจ่าย" };

export function Dashboard() {
  const [mode, setMode] = useState<ReportMode>("daily");
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [preview, setPreview] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/report?mode=${mode}&date=${date}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => { const payload = await r.json(); if (!r.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ"); return payload; })
      .then((data: { report: BudgetReport | null }) => { setReport(data.report); setMessage(""); })
      .catch((e) => { if (e.name !== "AbortError") { setReport(null); setMessage(e.message); } })
      .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    return () => ctrl.abort();
  }, [mode, date, reload]);

  const totals = useMemo(() => reportTotals(report?.items ?? []), [report]);
  const items = useMemo(() => (report?.items ?? []).filter((p) =>
    (status === "all" || p.status === status) && `${p.name} ${p.agency} ${p.code}`.toLowerCase().includes(search.toLowerCase())
  ), [report, search, status]);
  const maxBudget = Math.max(1, ...((report?.items ?? []).map((p) => p.budget)));
  const percent = totals.budget ? totals.allocated / totals.budget * 100 : 0;

  return <div className="app-shell">
    <header className="topbar"><div className="container topbar-inner">
      <div className="brand"><div className="brand-mark">นภ</div><div><strong>NBP Budget Monitor</strong><span>ระบบติดตามงบประมาณจังหวัดหนองบัวลำภู</span></div></div>
      <nav className="topnav"><a href="#overview" className="active">ภาพรวม</a><a href="#projects">รายโครงการ</a><Link href="/admin"><LockKeyhole size={15}/> หลังบ้าน</Link></nav>
    </div></header>
    <main className="container main-content">
      <section className="hero" id="overview"><div className="hero-pattern"/><div className="hero-content">
        <div className="hero-kicker"><span className="live-dot"/> PROVINCIAL BUDGET INTELLIGENCE</div>
        <h1>รายงานการจัดสรรงบประมาณ<br/><em>จังหวัดหนองบัวลำภู</em></h1>
        <p>โครงการตามแผนปฏิบัติราชการจังหวัด ประจำปีงบประมาณ พ.ศ. 2570 • งวดที่ 1</p>
        <div className="hero-meta"><span><CalendarDays size={15}/> {report ? `ข้อมูลบันทึกล่าสุด ${thaiDate(report.asOfDate)}` : "กำลังรอข้อมูล"}</span><span><ShieldCheck size={15}/> {report?.demo ? "โหมดตัวอย่าง — ยังไม่เผยแพร่" : "ข้อมูลรายงานที่เผยแพร่"}</span></div>
      </div></section>

      {report?.demo && <div className="notice notice-warning"><strong>ตัวอย่างสำหรับทดสอบระบบ:</strong> ข้อมูลนำเข้าจาก Excel ยังไม่ได้ตรวจสอบ/เผยแพร่จริง มีข้อควรตรวจสอบ {qualityWarnings(report.items,report.reportedTotals).length} รายการ โดยยอดจัดสรรรายโครงการรวมไม่ตรงกับแถวรวมในต้นฉบับ 300,000 บาท</div>}

      <section className="filterbar"><div className="filter-left"><div className="segment" aria-label="ประเภทรายงาน"><button className={mode === "daily" ? "selected" : ""} onClick={() => {setMode("daily");setBusy(true);}}>รายวัน</button><button className={mode === "monthly" ? "selected" : ""} onClick={() => {setMode("monthly");setBusy(true);}}>รายเดือน</button></div>
        <label className="date-field"><CalendarDays size={17}/><input aria-label="เลือกวันหรือเดือน" type={mode === "monthly" ? "month" : "date"} value={mode === "monthly" ? date.slice(0, 7) : date} onChange={(e) => {setDate(mode === "monthly" ? `${e.target.value}-01` : e.target.value);setBusy(true);}}/></label>
        <button className="icon-refresh" title="อัปเดต" onClick={() => {setBusy(true);setReload((n) => n + 1);}}><RefreshCcw size={18}/></button>
      </div><button className="button-primary" onClick={() => setPreview(true)} disabled={!report || busy}><Download size={17}/> ส่งออก PDF (A4)</button></section>

      {busy ? <div className="state-card">กำลังโหลดข้อมูลรายงาน...</div> : message ? <div className="state-card error">{message}</div> : !report ? <div className="state-card"><FileBarChart2 size={30}/><h2>ยังไม่มีรายงานที่เผยแพร่สำหรับช่วงเวลานี้</h2><p>เลือกวันอื่น หรือให้เจ้าหน้าที่บันทึกและเผยแพร่ข้อมูลในระบบหลังบ้าน</p></div> : <>
        <section className="kpi-grid" aria-label="ตัวเลขภาพรวม">
          <div className="kpi-card primary-kpi"><div className="kpi-label"><span>งบประมาณรวมทั้งสิ้น</span><Wallet size={19}/></div><strong>{money(totals.budget)}</strong><small>บาท • {report.items.length} รายการ</small><div className="kpi-decoration"/></div>
          <div className="kpi-card"><div className="kpi-label"><span>อนุมัติแล้ว</span><span className="kpi-dot green"/></div><strong>{compactMoney(totals.approved)}</strong><small>{totals.budget ? (totals.approved / totals.budget * 100).toFixed(1) : "0"}% ของงบประมาณรวม</small></div>
          <div className="kpi-card"><div className="kpi-label"><span>จัดสรรงวดที่ 1</span><span className="kpi-dot blue"/></div><strong>{compactMoney(totals.allocated)}</strong><small>{percent.toFixed(1)}% ของงบประมาณรวม</small></div>
          <div className="kpi-card"><div className="kpi-label"><span>คงเหลือยังไม่จัดสรร</span><span className="kpi-dot amber"/></div><strong>{compactMoney(totals.unallocated)}</strong><small>ยอดคงเหลือตามบัญชีต้นทาง</small></div>
        </section>
        <section className="analytics-grid">
          <div className="panel progress-panel"><div className="section-title"><div><span className="eyebrow">BUDGET ALLOCATION</span><h2>สัดส่วนการจัดสรรงบประมาณ</h2></div><ChartNoAxesCombined size={20}/></div>
            <div className="progress-pct">{percent.toFixed(1)}<span>%</span></div><div className="progress-track"><div style={{width:`${Math.min(100,percent)}%`}}/></div>
            <div className="progress-legend"><div><i className="legend-dot filled"/> จัดสรรแล้ว <strong>{money(totals.allocated)}</strong></div><div><i className="legend-dot blank"/> ยังไม่จัดสรร <strong>{money(totals.unallocated)}</strong></div></div>
            <div className="progress-foot">สรุปยอดตามบัญชีโครงการงวดที่ 1 • ไม่ใช่ยอดการเบิกจ่าย</div>
          </div>
          <div className="panel bars-panel"><div className="section-title"><div><span className="eyebrow">PROJECT RANKING</span><h2>โครงการที่มีงบประมาณสูงสุด</h2></div></div>
            {[...(report.items)].sort((a,b)=>b.budget-a.budget).slice(0,5).map((p,i)=><div key={p.code} className="bar-row"><div className="bar-heading"><span><b>{String(i+1).padStart(2,"0")}</b> {p.name}</span><strong>{compactMoney(p.budget)}</strong></div><div className="bar-track"><div style={{width:`${p.budget/maxBudget*100}%`}}/></div></div>)}
          </div>
        </section>
        <section className="panel project-panel" id="projects"><div className="project-top"><div><span className="eyebrow">PROJECT DETAILS</span><h2>รายละเอียดการจัดสรรรายโครงการ</h2><p>ค้นหาและกรองรายการตามชื่อโครงการหรือหน่วยดำเนินการ</p></div><div className="project-controls"><label className="searchbox"><Search size={17}/><input placeholder="ค้นหาโครงการหรือหน่วยงาน..." value={search} onChange={(e)=>setSearch(e.target.value)}/></label><select aria-label="กรองสถานะ" value={status} onChange={(e)=>setStatus(e.target.value)}><option value="all">ทุกสถานะ</option><option value="approved">อนุมัติแล้ว</option><option value="pending">รออนุมัติ</option><option value="mixed">อนุมัติบางส่วน</option><option value="reserve">เงินเหลือจ่าย</option></select></div></div>
          <div className="table-scroll"><table className="project-table"><thead><tr><th>ลำดับ</th><th>โครงการ</th><th>งบประมาณ (บาท)</th><th>อนุมัติแล้ว</th><th>จัดสรรงวดที่ 1</th><th>คงเหลือยังไม่จัดสรร</th><th>สถานะ</th></tr></thead><tbody>{items.map((p)=><tr key={p.code}><td>{p.code}</td><td className="project-name"><b>{p.name}</b><span>{p.agency || "ไม่ระบุหน่วยงาน"}</span></td><td>{money(p.budget)}</td><td>{money(p.approved)}</td><td className="emphasis-cell">{money(p.allocated)}</td><td>{money(p.unallocated)}</td><td><span className={`status-pill ${p.status}`}>{statusLabel[p.status]}</span></td></tr>)}</tbody></table></div>
          <div className="table-footer">แสดง {items.length} จาก {report.items.length} รายการ <span>ข้อมูล ณ {thaiDate(report.asOfDate)}</span></div>
        </section>
      </>}
      <footer className="footer"><span>© จังหวัดหนองบัวลำภู • ระบบรายงานงบประมาณ พ.ศ. 2570</span><span>รายงานวันที่เลือกใช้ข้อมูลล่าสุดที่บันทึกไว้ไม่เกินวันนั้น</span></footer>
    </main>
    {preview && report && <PdfPreview report={report} mode={mode} selectedDate={date} onClose={() => setPreview(false)}/>}
  </div>;
}
