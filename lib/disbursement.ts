export type DisbursementRow = {
  code?: string;
  project_code?: string;
  name?: string;
  activity?: string;
  agency?: string;
  budget: number;
  po: number;
  disbursed: number;
  remaining: number;
  spent?: number;
  surplus?: number;
};
export type DisbursementReport = {
  fiscal_year: number;
  as_of_date: string;
  report_type: 'disbursement';
  source_file: string;
  totals: { budget: number; po: number; disbursed: number; spent: number; surplus: number; remaining: number };
  projects: DisbursementRow[];
  activities: DisbursementRow[];
};
export const moneyTH = (n: number) => new Intl.NumberFormat('th-TH', {maximumFractionDigits: 2}).format(n);
export const percentTH = (a: number,b: number) => b > 0 ? (a / b * 100).toFixed(2) : '0.00';
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const approx = (a:number,b:number) => Math.abs(a-b) < 1.01;
export function validateDisbursement(value: unknown): { report: DisbursementReport | null; errors: string[] } {
  const errors: string[]=[];
  if (!value || typeof value !== 'object') return {report:null,errors:['ไฟล์ JSON ไม่ใช่ออบเจ็กต์']};
  const v = value as Record<string, unknown>;
  if (v.fiscal_year !== 2570 || v.report_type !== 'disbursement') errors.push('รองรับเฉพาะรายงานผลเบิกจ่าย ปีงบประมาณ 2570');
  if (typeof v.as_of_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.as_of_date) || Number.isNaN(Date.parse(v.as_of_date + 'T00:00:00Z'))) errors.push('วันที่รายงานไม่ถูกต้อง');
  if (typeof v.source_file !== 'string' || !v.source_file.trim()) errors.push('ไม่ระบุแหล่งข้อมูล');
  if (!Array.isArray(v.projects) || v.projects.length < 1 || v.projects.length > 200) errors.push('จำนวนโครงการไม่ถูกต้อง');
  if (!Array.isArray(v.activities) || v.activities.length > 1000) errors.push('จำนวนกิจกรรมไม่ถูกต้อง');
  for (const field of ['projects','activities'] as const) {
    if (!Array.isArray(v[field])) continue;
    for (const [i,row] of v[field].entries()) {
      if (!row || typeof row !== 'object') {errors.push(`${field} แถว ${i+1} ไม่ถูกต้อง`);continue;}
      for (const key of ['budget','po','disbursed','remaining']) if (!finite(row[key])) errors.push(`${field} แถว ${i+1} ช่อง ${key} ไม่ถูกต้อง`);
      if (field === 'projects' && typeof row.name !== 'string') errors.push(`ชื่อโครงการแถว ${i+1} ไม่ถูกต้อง`);
      if (field === 'activities' && typeof row.activity !== 'string') errors.push(`ชื่อกิจกรรมแถว ${i+1} ไม่ถูกต้อง`);
      if (finite(row.budget) && finite(row.disbursed) && finite(row.remaining) && !approx(row.budget,row.disbursed+row.remaining+(finite(row.surplus)?row.surplus:0))) errors.push(`${field} แถว ${i+1} ยอดคงเหลือไม่สัมพันธ์กับงบและเบิกจ่าย`);
    }
  }
  const t = v.totals;
  if (!t || typeof t !== 'object') errors.push('ไม่พบยอดรวม');
  else {
    for (const key of ['budget','po','disbursed','spent','surplus','remaining']) if (!finite((t as Record<string,unknown>)[key])) errors.push(`ยอดรวม ${key} ไม่ถูกต้อง`);
    if (errors.length===0) {
      for (const field of ['budget','po','disbursed','remaining'] as const) {
        const sum = (v.projects as DisbursementRow[]).reduce((a,r)=>a+r[field],0);
        if (!approx(sum,(t as Record<string,number>)[field])) errors.push(`ยอดรวม ${field} ไม่ตรงกับผลรวมรายโครงการ (${sum})`);
      }
    }
  }
  return {report:errors.length ? null : (v as unknown as DisbursementReport), errors};
}
