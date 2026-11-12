import type { DisbursementReport, DisbursementRow } from '@/lib/disbursement';
import { moneyTH, percentTH } from '@/lib/disbursement';

type PrintMode = 'summary' | 'full';
type Props = { report: DisbursementReport; preview: boolean; mode: PrintMode; printedAt: string };
const thaiDate = (day: string) => {
  const date = new Date(day + 'T12:00:00+07:00');
  return Number.isNaN(date.getTime()) ? day : new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date);
};
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, index) => arr.slice(index * size, (index + 1) * size));
const pct = (n: number, d: number) => Math.max(0, Math.min(100, d > 0 ? (n / d) * 100 : 0));
function PageFooter({ printedAt }: { printedAt: string }) {
  return <footer className="pr-footer"><span>จังหวัดหนองบัวลำภู · ผลการเบิกจ่ายงบประมาณ พ.ศ. 2570</span><span>{thaiDate(printedAt)}</span></footer>;
}
function PageTitle({ number, name, sub }: { number: string; name: string; sub: string }) {
  return <div className="pr-page-title"><div><h2>{name}</h2><p>{sub}</p></div><span className="pr-page-number">{number}</span></div>;
}
function Money({ value }: { value: number }) { return <>{moneyTH(value)}</>; }
export function ExecutivePrintReport({ report, preview, mode, printedAt }: Props) {
  const projects = report.projects;
  const activities = report.activities;
  const active = projects.filter(p => p.code !== 'RESERVE' && p.disbursed > 0);
  const notStarted = projects.filter(p => p.code !== 'RESERVE' && p.disbursed <= 0);
  const budget = report.totals.budget;
  const paid = report.totals.disbursed;
  const remain = report.totals.remaining;
  const displayProjects = [...projects].sort((a,b) => b.disbursed - a.disbursed || b.budget - a.budget);
  const important = displayProjects.filter(p => p.disbursed > 0).slice(0, 4);
  const topBudget = displayProjects.filter(p => p.code !== 'RESERVE').sort((a,b)=>b.budget-a.budget).slice(0,4);
  const pages = chunk(activities, 9);
  const totalProjects = projects.filter(p => p.code !== 'RESERVE').length;
  // A printed report has two distinct dates: the day it was created and the latest financial data date.
  const reportDay = printedAt || report.as_of_date;
  return <div className={['pr-report', mode === 'summary' ? 'pr-summary-only' : 'pr-full-report'].join(' ')} aria-label="เอกสารพิมพ์รายงานงบประมาณ">
    <section className="pr-page pr-cover">
      <header className="pr-hero">
        <div className="pr-hero-ring" aria-hidden="true"/>
        <span className="pr-pill">รายงานผลการเบิกจ่าย</span>
        <h1>ผลการเบิกจ่ายงบประมาณจังหวัด<br/><small>หนองบัวลำภู · ปีงบประมาณ พ.ศ. 2570</small></h1>
        <div className="pr-hero-value"><Money value={budget}/><span>บาท</span></div>
        <p>กรอบวงเงินงบประมาณ · {totalProjects} โครงการ · {activities.length} กิจกรรม/กิจกรรมย่อย</p>
      </header>
      <div className="pr-date-line"><strong>วันที่จัดทำรายงาน {thaiDate(reportDay)}</strong><span>ข้อมูลเบิกจ่าย ณ {thaiDate(report.as_of_date)}</span></div>
      {preview && <div className="pr-draft-status">ฉบับร่าง · ยังไม่ยืนยันข้อมูล</div>}
      <div className="pr-stat-grid">
        <div className="pr-stat"><span>เบิกจ่ายสะสม</span><b><Money value={paid}/></b><small>บาท</small></div>
        <div className="pr-stat"><span>คงเหลือยังไม่เบิกจ่าย</span><b><Money value={remain}/></b><small>บาท</small></div>
        <div className="pr-stat pr-stat-accent"><span>อัตราการเบิกจ่าย</span><b>{percentTH(paid,budget)}%</b><small>ของวงเงินงบประมาณ</small></div>
      </div>
      <section className="pr-section pr-progress-section">
        <div className="pr-section-heading"><h2>ภาพรวมความก้าวหน้า</h2><b>{percentTH(paid,budget)}%</b></div>
        <div className="pr-progress"><div style={{ width: pct(paid,budget)+'%' }}/></div>
        <div className="pr-progress-labels"><span>เบิกจ่ายแล้ว <b><Money value={paid}/> บาท</b></span><span>ยังไม่เบิกจ่าย <b><Money value={remain}/> บาท</b></span></div>
      </section>
      <section className="pr-status-band">
        <h2>สถานะการเบิกจ่ายรายโครงการ</h2>
        <div><strong>{totalProjects}</strong><span>โครงการทั้งหมด</span></div>
        <div><strong>{active.length}</strong><span>เริ่มเบิกจ่ายแล้ว</span></div>
        <div><strong>{notStarted.length}</strong><span>ยังไม่มีการเบิกจ่าย</span></div>
      </section>
      <section className="pr-section pr-featured">
        <div className="pr-section-heading"><h2>โครงการที่มีการเบิกจ่าย</h2></div>
        {(important.length ? important : topBudget).map((p,i)=><div className="pr-feature-row" key={p.code ?? i}>
          <span className="pr-index">{String(i+1).padStart(2,'0')}</span>
          <div><strong>{p.name ?? p.activity}</strong><small>วงเงิน <Money value={p.budget}/> บาท</small></div>
          <b><Money value={p.disbursed}/> <small>บาท</small></b>
        </div>)}

      </section>
      <PageFooter printedAt={reportDay}/>
    </section>
    <section className="pr-page pr-detail-page pr-full-only">
      <PageTitle number="01" name="สรุปผลการเบิกจ่ายรายโครงการ" sub="งบประมาณ · ผลเบิกจ่ายสะสม · คงเหลือ และอัตราความก้าวหน้า"/>
      <div className="pr-table-panel">
        <table className="pr-table pr-project-table"><thead><tr><th>โครงการ</th><th>งบประมาณ</th><th>เบิกจ่ายแล้ว</th><th>คงเหลือ</th><th>ร้อยละ</th></tr></thead>
          <tbody>{projects.map((p,i)=><tr key={p.code??i}><td><span className="pr-code">{p.code==='RESERVE'?'เงินเหลือจ่าย':String(i+1).padStart(2,'0')}</span><strong>{p.name??p.activity}</strong></td><td><Money value={p.budget}/></td><td><Money value={p.disbursed}/></td><td><Money value={p.remaining}/></td><td><b>{percentTH(p.disbursed,p.budget)}%</b></td></tr>)}</tbody>
          <tfoot><tr><td>รวมทั้งสิ้น</td><td><Money value={budget}/></td><td><Money value={paid}/></td><td><Money value={remain}/></td><td>{percentTH(paid,budget)}%</td></tr></tfoot>
        </table>
      </div>
      <div className="pr-table-note">ข้อมูลเบิกจ่าย ณ {thaiDate(report.as_of_date)}{preview?' · ฉบับร่าง':''}</div>
      <PageFooter printedAt={reportDay}/>
    </section>
    {pages.map((part,index)=><section className="pr-page pr-detail-page pr-full-only" key={index}>
      <PageTitle number={String(index+2).padStart(2,'0')} name="ผลการเบิกจ่ายรายกิจกรรมย่อย" sub={`รายละเอียดรายการที่ ${index*9+1}–${index*9+part.length} จากทั้งหมด ${activities.length} รายการ`}/>
      <div className="pr-table-panel"><table className="pr-table pr-activity-table"><thead><tr><th>กิจกรรม/หน่วยดำเนินการ</th><th>งบประมาณ</th><th>เบิกจ่ายแล้ว</th><th>คงเหลือ</th></tr></thead><tbody>
        {part.map((p:DisbursementRow,i:number)=><tr key={p.code??index*9+i}><td><span className="pr-activity-code">{p.project_code??''} · {String(index*9+i+1).padStart(2,'0')}</span><strong>{p.activity??p.name}</strong><small>หน่วยดำเนินการ: {p.agency||'ไม่ระบุ'}</small></td><td><Money value={p.budget}/></td><td><Money value={p.disbursed}/></td><td><Money value={p.remaining}/></td></tr>)}
      </tbody></table></div>
      <div className="pr-table-note">ข้อมูลเบิกจ่าย ณ {thaiDate(report.as_of_date)}{preview?' · ฉบับร่าง':''}</div>
      <PageFooter printedAt={reportDay}/>
    </section>)}
  </div>;
}
