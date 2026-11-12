import type { BudgetReport, ReportMode } from "@/lib/types";
import { money, qualityWarnings, reportTotals, thaiDate } from "@/lib/report";

type Props = { report: BudgetReport; mode: ReportMode; selectedDate: string };

export function ReportSheet({ report, mode, selectedDate }: Props) {
  const totals = reportTotals(report.items);
  const percentage = totals.budget ? (totals.allocated / totals.budget * 100).toFixed(1) : "0.0";
  const label = mode === "daily" ? `รายวัน ณ ${thaiDate(selectedDate)}` : `รายเดือน ${thaiDate(selectedDate, true)}`;
  return <div className="a4-sheet" id="a4-sheet">
    <div className="sheet-accent" />
    <div className="sheet-masthead">
      <div className="sheet-logo">นภ.</div>
      <div>
        <div className="sheet-eyebrow">รายงานติดตามการจัดสรรงบประมาณ</div>
        <h1>จังหวัดหนองบัวลำภู</h1>
        <div className="sheet-subtitle">ตามแผนปฏิบัติราชการจังหวัด ประจำปีงบประมาณ พ.ศ. 2570 • งวดที่ 1</div>
      </div>
    </div>
    <div className="sheet-period"><span>{label}</span><span>ข้อมูลบันทึกล่าสุด {thaiDate(report.asOfDate)}</span></div>
    <div className="sheet-highlight">
      <div><small>งบประมาณรวม</small><strong>{money(totals.budget)}</strong><small>บาท</small></div>
      <div><small>จัดสรรแล้ว</small><strong>{money(totals.allocated)}</strong><small>บาท</small></div>
      <div><small>สัดส่วนจัดสรร</small><strong>{percentage}%</strong><small>ของงบประมาณรวม</small></div>
    </div>
    <div className="sheet-progress"><div style={{ width: `${Math.min(100, Number(percentage))}%` }} /></div>
    <div className="sheet-secondary">
      <div><span>อนุมัติแล้ว</span><b>{money(totals.approved)} บาท</b></div>
      <div><span>ยังไม่อนุมัติ</span><b>{money(totals.unapproved)} บาท</b></div>
      <div><span>คงเหลือยังไม่จัดสรร</span><b>{money(totals.unallocated)} บาท</b></div>
    </div>
    <div className="sheet-heading"><b>สรุปงบประมาณจำแนกตามโครงการ</b><span>{report.items.length} รายการ (รวมเงินเหลือจ่าย หากมี)</span></div>
    <table className="sheet-table">
      <thead><tr><th>ลำดับ</th><th>โครงการ / รายการ</th><th>งบประมาณ</th><th>อนุมัติแล้ว</th><th>จัดสรรงวด 1</th><th>ยังไม่จัดสรร</th></tr></thead>
      <tbody>
        {report.items.map((p) => <tr key={p.code}>
          <td>{p.code}</td><td>{p.name}</td><td>{money(p.budget)}</td><td>{money(p.approved)}</td><td>{money(p.allocated)}</td><td>{money(p.unallocated)}</td>
        </tr>)}
      </tbody>
      <tfoot><tr><td colSpan={2}>รวมทั้งสิ้น</td><td>{money(totals.budget)}</td><td>{money(totals.approved)}</td><td>{money(totals.allocated)}</td><td>{money(totals.unallocated)}</td></tr></tfoot>
    </table>
    <div className="sheet-footer">
      <div><b>หมายเหตุ</b> รายงานนี้เป็นสถานะยอดงบประมาณ ณ วันที่บันทึกล่าสุด ไม่ใช่ยอดการเบิกจ่าย และยอดรายเดือนไม่ใช่การนำยอดรายวันมาบวกกัน</div>
      <div>ที่มา: {report.source || "ระบบติดตามงบประมาณจังหวัดหนองบัวลำภู"}</div>
      {report.demo && <div className="sheet-demo">ตัวอย่างจากไฟล์ต้นฉบับ • ยังไม่ผ่านการตรวจสอบ/เผยแพร่ • พบความคลาดเคลื่อน {qualityWarnings(report.items,report.reportedTotals).length} รายการ</div>}
      <div className="sheet-bottom"><span>ระบบรายงานงบประมาณจังหวัดหนองบัวลำภู</span><span>พิมพ์บนกระดาษ A4 • 1 หน้า</span></div>
    </div>
  </div>;
}
