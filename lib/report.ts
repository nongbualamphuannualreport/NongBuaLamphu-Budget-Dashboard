import type { BudgetItem, BudgetReport, BudgetTotals, ReportQuery } from "@/lib/types";

export const formatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
export const money = (n: number) => formatter.format(n);
export const compactMoney = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} ล้าน` : money(n);

export function reportTotals(items: BudgetItem[]) {
  return items.reduce((sum, p) => ({
    budget: sum.budget + p.budget,
    approved: sum.approved + p.approved,
    allocated: sum.allocated + p.allocated,
    unapproved: sum.unapproved + p.unapproved,
    unallocated: sum.unallocated + p.unallocated,
  }), { budget: 0, approved: 0, allocated: 0, unapproved: 0, unallocated: 0 });
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthEnd(date: string) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return isoDate(new Date(year, month, 0));
}

export function reportCutoff(query: ReportQuery) {
  return query.mode === "monthly" ? monthEnd(query.date) : query.date;
}

export function thaiDate(iso: string, monthOnly = false) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", monthOnly
    ? { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }
    : { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(d);
}

export function qualityWarnings(items: BudgetItem[], reportedTotals: BudgetTotals | null = null): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.code)) warnings.push(`รหัส ${item.code} ซ้ำกัน`);
    seen.add(item.code);
    if (Math.abs(item.budget - item.approved - item.unapproved) > 1) {
      warnings.push(`รายการ ${item.code}: งบประมาณ − อนุมัติ ไม่ตรงกับยอดยังไม่อนุมัติ`);
    }
    if (item.allocated > item.budget + 1) {
      warnings.push(`รายการ ${item.code}: ยอดจัดสรรสูงกว่างบประมาณโครงการ`);
    }
  }
  if (reportedTotals) {
    const total = reportTotals(items);
    for (const [key, label] of ([
      ["budget", "งบประมาณรวม"], ["approved", "อนุมัติแล้ว"], ["allocated", "จัดสรรงวดที่ 1"],
      ["unapproved", "ยังไม่อนุมัติ"], ["unallocated", "ยังไม่จัดสรร"],
    ] as const)) {
      if (Math.abs(total[key] - reportedTotals[key]) > 1) {
        warnings.push(`${label}: ผลรวมรายโครงการ ${money(total[key])} บาท ไม่ตรงกับยอดรวมตามบัญชี ${money(reportedTotals[key])} บาท`);
      }
    }
  }
  return warnings;
}

export function compareReports(a: BudgetReport, b?: BudgetReport | null) {
  const total = reportTotals(a.items);
  const previous = b ? reportTotals(b.items) : null;
  return { total, deltaAllocated: previous ? total.allocated - previous.allocated : null };
}
