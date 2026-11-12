"use client";

import { useRef, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import type { BudgetReport, ReportMode } from "@/lib/types";
import { ReportSheet } from "@/components/ReportSheet";

export function PdfPreview({ report, mode, selectedDate, onClose }: {
  report: BudgetReport; mode: ReportMode; selectedDate: string; onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (!sheet.current) return;
    setWorking(true); setError("");
    try {
      await document.fonts.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"), import("jspdf"),
      ]);
      const canvas = await html2canvas(sheet.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm", compress: true });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297);
      pdf.save(`NongBuaLamphu_Budget_${mode}_${selectedDate.slice(0, mode === "monthly" ? 7 : 10)}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? `สร้าง PDF ไม่สำเร็จ: ${e.message}` : "สร้าง PDF ไม่สำเร็จ");
    } finally { setWorking(false); }
  }
  return <div className="preview-backdrop" role="dialog" aria-modal="true" aria-label="ตัวอย่างรายงาน PDF">
    <div className="preview-dialog">
      <div className="preview-toolbar">
        <div><strong>ตัวอย่างรายงาน A4 หน้าเดียว</strong><span>รายงาน {mode === "daily" ? "รายวัน" : "รายเดือน"}</span></div>
        <div className="toolbar-actions">
          <button className="button-secondary" onClick={() => window.print()}><Printer size={16}/> พิมพ์</button>
          <button className="button-primary" disabled={working} onClick={download}><Download size={16}/>{working ? "กำลังสร้าง..." : "ดาวน์โหลด PDF"}</button>
          <button className="icon-button" aria-label="ปิด" onClick={onClose}><X size={20}/></button>
        </div>
      </div>
      {error && <p className="inline-error">{error}</p>}
      <div className="preview-scroll"><div ref={sheet} className="sheet-outer"><ReportSheet report={report} mode={mode} selectedDate={selectedDate}/></div></div>
    </div>
  </div>;
}
