"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudUpload, LockKeyhole, LogOut, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { BudgetItem, BudgetReport, BudgetTotals, ProjectStatus } from "@/lib/types";
import { isoDate, money, qualityWarnings, reportTotals, thaiDate } from "@/lib/report";

const initialDate = () => isoDate(new Date());
const statusLabels: Record<ProjectStatus, string> = {
  approved: "อนุมัติแล้ว", mixed: "อนุมัติบางส่วน", pending: "ยังไม่อนุมัติ", reserve: "เงินเหลือจ่าย",
};

export function AdminEditor() {
  const client = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key && !url.includes("YOUR_PROJECT") ? createClient(url, key) : null;
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [date, setDate] = useState(initialDate);
  const [source, setSource] = useState("");
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [reportedTotals, setReportedTotals] = useState<BudgetTotals | null>(null);
  const [published, setPublished] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [borrowed, setBorrowed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) { setAuthLoading(false); return; }
    client.auth.getSession().then(({data}) => { setToken(data.session?.access_token ?? null); setAuthLoading(false); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => setToken(session?.access_token ?? null));
    return () => subscription.unsubscribe();
  }, [client]);

  async function getToken() {
    const { data } = await client!.auth.getSession();
    if (!data.session) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");
    return data.session.access_token;
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;
    setBusy(true); setError("");
    const { error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError) setError("เข้าสู่ระบบไม่สำเร็จ โปรดตรวจสอบอีเมลและรหัสผ่าน");
    setBusy(false);
  }

  async function loadSnapshot() {
    if (!client) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const sessionToken = await getToken();
      const result = await fetch(`/api/admin/snapshot?date=${date}`, { headers: { Authorization: `Bearer ${sessionToken}` }, cache: "no-store" });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error ?? "ไม่สามารถโหลดข้อมูลได้");
      const report = body.report as BudgetReport;
      setItems(report.items); setReportedTotals(report.reportedTotals ?? reportTotals(report.items)); setPublished(report.published); setSource(report.source);
      setBorrowed(body.copiedFrom ?? (report.demo ? report.asOfDate : null)); setLoaded(true);
      setNotice(body.exists ? `โหลดข้อมูล ณ ${thaiDate(date)} แล้ว` : "โหลดข้อมูลตั้งต้นเพื่อสร้างรายการของวันใหม่ กรุณาตรวจสอบก่อนบันทึก");
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); }
    finally { setBusy(false); }
  }

  useEffect(() => { setLoaded(false); setNotice(""); }, [date]);
  useEffect(() => { if (token && client && !loaded && !busy) {
    // Date selection is explicit: do not silently overwrite unsaved edits.
  } }, [token, client, loaded, busy]);

  function patchItem(index: number, key: keyof BudgetItem, value: string | number) {
    setItems((prev) => prev.map((p, i) => i === index ? { ...p, [key]: value } : p));
    setNotice("");
  }

  function addItem() {
    const codes = new Set(items.map((p) => p.code));
    let next = items.length + 1;
    while (codes.has(String(next))) next++;
    setItems((prev) => [...prev, {
      code: String(next), name: "", agency: "", budget: 0, approved: 0,
      allocated: 0, unapproved: 0, unallocated: 0, status: "pending", reference: "", note: "",
    }]);
  }

  async function saveSnapshot() {
    if (!client || !loaded) return;
    if (published && !window.confirm(`ยืนยันเผยแพร่ข้อมูล ณ ${thaiDate(date)} ให้ประชาชนดูได้?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const sessionToken = await getToken();
      const response = await fetch("/api/admin/snapshot", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ date, published, source, reportedTotals, items }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error([body.error, ...(body.warnings ?? [])].filter(Boolean).join("\n"));
      setBorrowed(null);
      setNotice(published ? "บันทึกและเผยแพร่รายงานเรียบร้อยแล้ว" : "บันทึกฉบับร่างเรียบร้อยแล้ว (ยังไม่แสดงหน้าสาธารณะ)");
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  const totals = reportTotals(items);
  const warnings = qualityWarnings(items, reportedTotals);

  return <div className="admin-app">
    <header className="admin-topbar"><div className="container admin-top-inner"><div className="admin-brand"><div className="brand-mark">นภ</div><div><b>Budget Control Center</b><span>ระบบจัดการข้อมูลภายในจังหวัดหนองบัวลำภู</span></div></div><div className="admin-nav"><Link href="/"><ArrowLeft size={16}/> กลับหน้ารายงาน</Link>{token && <button onClick={async () => { await client?.auth.signOut(); setToken(null); setLoaded(false); }}><LogOut size={16}/> ออกจากระบบ</button>}</div></div></header>
    <main className="container admin-main">
      <div className="admin-heading"><div><div className="eyebrow">SECURE ADMINISTRATION</div><h1>จัดการข้อมูลงบประมาณ</h1><p>ปรับปรุงข้อมูลรายวัน ตรวจสอบยอด และเลือกเผยแพร่สู่หน้ารายงานสาธารณะ</p></div><span className="admin-badge"><LockKeyhole size={14}/> เฉพาะผู้มีสิทธิ์</span></div>
      {!client ? <div className="state-card"><AlertTriangle size={28}/><h2>ยังไม่ได้เชื่อมฐานข้อมูล</h2><p>เพิ่มตัวแปร NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY และ SUPABASE_SERVICE_ROLE_KEY บน Vercel และรันไฟล์ supabase/schema.sql ก่อนใช้งานหลังบ้าน</p></div>
      : authLoading ? <div className="state-card">กำลังตรวจสอบการเข้าสู่ระบบ...</div>
      : !token ? <form className="login-card" onSubmit={signIn}><div className="login-symbol"><LockKeyhole size={25}/></div><h2>เข้าสู่ระบบเจ้าหน้าที่</h2><p>ใช้บัญชีที่ได้รับสิทธิ์ใน Supabase Auth</p><label>อีเมล<input type="email" required autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="admin@example.go.th"/></label><label>รหัสผ่าน<input type="password" required autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••"/></label>{error && <p className="inline-error">{error}</p>}<button className="button-primary full" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button><small>ไม่มีระบบสมัครสมาชิกสาธารณะ ผู้ดูแลต้องกำหนดสิทธิ์ให้ก่อน</small></form>
      : <>
        <div className="admin-loadbar"><label>วันที่บันทึกข้อมูล<input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></label><button className="button-secondary" disabled={busy} onClick={loadSnapshot}><RefreshCw size={16}/>{busy ? "กำลังโหลด..." : "เปิดข้อมูลวันที่เลือก"}</button><div className="admin-loadhint">เลือกวันที่ใหม่เพื่อคัดลอกจากข้อมูลล่าสุดและบันทึกเป็น snapshot ใหม่</div></div>
        {error && <div className="notice notice-error" style={{whiteSpace:"pre-line"}}>{error}</div>}
        {notice && <div className="notice notice-success"><CheckCircle2 size={18}/>{notice}</div>}
        {!loaded ? <div className="state-card"><CloudUpload size={30}/><h2>เลือกวันที่แล้วกด “เปิดข้อมูลวันที่เลือก”</h2><p>ระบบจะโหลดข้อมูลที่เคยบันทึก หรือคัดลอกข้อมูลก่อนหน้ามาเป็นฉบับตั้งต้นสำหรับวันใหม่</p></div> : <>
          {borrowed && <div className="notice notice-warning">กำลังใช้ข้อมูลจากวันที่ {thaiDate(borrowed)} เป็นต้นแบบของวันที่ {thaiDate(date)} — ยังไม่ได้บันทึกฉบับใหม่</div>}
          <div className="admin-stats"><div><span>งบประมาณรวม</span><b>{money(totals.budget)}</b></div><div><span>อนุมัติแล้ว</span><b>{money(totals.approved)}</b></div><div><span>จัดสรรแล้ว</span><b>{money(totals.allocated)}</b></div><div><span>รายการ</span><b>{items.length}</b></div></div>
          <section className="admin-panel"><div className="admin-panel-title"><div><h2>รายการโครงการ</h2><p>แก้ไขตัวเลขตามบัญชีราชการได้โดยตรง</p></div><button className="button-secondary" onClick={addItem}><Plus size={16}/> เพิ่มโครงการ</button></div>
            <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>รหัส</th><th>ชื่อโครงการ / หน่วยดำเนิน</th><th>งบประมาณ</th><th>อนุมัติแล้ว</th><th>จัดสรรงวด 1</th><th>ยังไม่อนุมัติ</th><th>ยังไม่จัดสรร</th><th>สถานะ</th><th>ลบ</th></tr></thead><tbody>{items.map((p,i)=><tr key={`${p.code}-${i}`}><td><input aria-label={`รหัสแถว ${i+1}`} className="code-input" value={p.code} onChange={(e)=>patchItem(i,"code",e.target.value)}/></td><td className="admin-name-cell"><textarea aria-label={`ชื่อโครงการ ${i+1}`} rows={2} value={p.name} onChange={(e)=>patchItem(i,"name",e.target.value)}/><input aria-label={`หน่วยงาน ${i+1}`} placeholder="หน่วยดำเนินการ" value={p.agency} onChange={(e)=>patchItem(i,"agency",e.target.value)}/><input aria-label={`เลขหนังสือ ${i+1}`} placeholder="เลขที่หนังสืออ้างอิง" value={p.reference} onChange={(e)=>patchItem(i,"reference",e.target.value)}/><input aria-label={`หมายเหตุ ${i+1}`} placeholder="หมายเหตุ" value={p.note} onChange={(e)=>patchItem(i,"note",e.target.value)}/></td>{(["budget","approved","allocated","unapproved","unallocated"] as const).map((field)=><td key={field}><input type="number" min={0} step="0.01" aria-label={`${field} โครงการ ${p.code}`} value={p[field]} onChange={(e)=>patchItem(i,field,Number(e.target.value))}/></td>)}<td><select aria-label={`สถานะ ${p.code}`} value={p.status} onChange={(e)=>patchItem(i,"status",e.target.value as ProjectStatus)}>{(Object.entries(statusLabels) as [ProjectStatus,string][]).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></td><td><button className="delete-btn" title="ลบรายการ" onClick={()=>{if(window.confirm(`ลบรายการ ${p.code}?`))setItems((old)=>old.filter((_,j)=>j!==i));}}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>
          </section>
          <section className="admin-panel reported-panel"><div className="admin-panel-title"><div><h2>ยอดรวมตามบัญชีต้นทาง</h2><p>กรอกยอดรวมจากบรรทัด “รวมทั้งสิ้น” เพื่อเทียบกับยอดรายโครงการ ระบบจะเตือนหากไม่ตรง</p></div></div>
            <div className="reported-grid">{([ ["budget","งบประมาณรวม"],["approved","อนุมัติแล้ว"],["allocated","จัดสรรงวดที่ 1"],["unapproved","ยังไม่อนุมัติ"],["unallocated","ยังไม่จัดสรร"] ] as [keyof BudgetTotals,string][]).map(([field,label])=><label key={field}>{label}<input type="number" min="0" step="0.01" value={reportedTotals?.[field] ?? totals[field]} onChange={(e)=>setReportedTotals((old)=>({...(old ?? totals),[field]:Number(e.target.value)}))}/></label>)}</div>
            <div className="reported-note">หากเอกสารต้นทางฉบับใหม่ระบุยอดต่างจากเดิม ให้แก้ยอดตามเอกสารจริงและปรับรายการโครงการให้ตรงกันก่อนเผยแพร่</div>
          </section>
          {warnings.length > 0 && <div className="notice notice-warning warnings"><AlertTriangle size={19}/><div><b>พบข้อควรตรวจสอบ {warnings.length} รายการ</b><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul><small>บันทึกฉบับร่างได้ แต่ต้องแก้ความคลาดเคลื่อนก่อนเผยแพร่</small></div></div>}
          <section className="admin-publish"><div className="admin-source"><label>แหล่งข้อมูล / หมายเหตุรายงาน<input value={source} onChange={(e)=>setSource(e.target.value)} placeholder="เช่น บัญชีจัดสรรงบประมาณ งวดที่ 1"/></label><label className="publish-check"><input type="checkbox" checked={published} onChange={(e)=>setPublished(e.target.checked)}/><span><b>เผยแพร่บนหน้ารายงานสาธารณะ</b><small>หากไม่เลือก จะบันทึกเป็นฉบับร่างที่บุคคลทั่วไปดูไม่ได้</small></span></label></div><button className="button-primary big" disabled={busy || (published && warnings.length>0)} onClick={saveSnapshot}><Save size={18}/>{busy ? "กำลังบันทึก..." : published ? "บันทึกและเผยแพร่" : "บันทึกฉบับร่าง"}</button></section>
        </>}
      </>}
    </main>
  </div>;
}
