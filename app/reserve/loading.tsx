export default function ReserveLoading(){
 return <div className="rv-wrap rv-loading" aria-busy="true" aria-label="กำลังเปิดรายงานเงินโอนเปลี่ยนแปลง">
  <header className="rv-top"><div><p>รายงานงบประมาณจังหวัดหนองบัวลำภู</p><h1>เงินคงเหลือจากการโอนเปลี่ยนแปลง</h1><p role="status" aria-live="polite">กำลังโหลดข้อมูลเงินโอนเปลี่ยนแปลง...</p></div></header>
  <section className="rv-summary" aria-label="กำลังโหลดสรุปเงินโอน">
   {['วงเงินกองเงินเริ่มต้น','จัดสรรไปยังโครงการแล้ว','ยังไม่จัดสรร'].map(label=><article key={label}><span>{label}</span><div className="rv-loading-number" aria-hidden="true"/></article>)}
  </section>
  <section className="rv-card"><h2>โครงการที่ได้รับจัดสรรจากกองเงินนี้</h2><div className="rv-loading-line" aria-hidden="true"/><div className="rv-loading-line short" aria-hidden="true"/></section>
 </div>;
}
