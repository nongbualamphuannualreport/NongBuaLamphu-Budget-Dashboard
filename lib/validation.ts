import type { BudgetItem, BudgetTotals, ProjectStatus } from "@/lib/types";

const statuses: ProjectStatus[] = ["approved", "pending", "mixed", "reserve"];

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseBudgetItems(value: unknown): BudgetItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new Error("ต้องมีรายการโครงการระหว่าง 1–200 รายการ");
  }
  const codes = new Set<string>();
  return value.map((raw, idx) => {
    if (!raw || typeof raw !== "object") throw new Error(`รายการ ${idx + 1} ไม่ถูกต้อง`);
    const obj = raw as Record<string, unknown>;
    const s = (key: string, max = 1000) => {
      if (typeof obj[key] !== "string") throw new Error(`กรุณาระบุ ${key} ในรายการ ${idx + 1}`);
      return (obj[key] as string).trim().slice(0, max);
    };
    const n = (key: string) => {
      const v = obj[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e13) {
        throw new Error(`จำนวนเงิน ${key} ในรายการ ${idx + 1} ไม่ถูกต้อง`);
      }
      return Math.round(v * 100) / 100;
    };
    const code = s("code", 40);
    const name = s("name", 500);
    if (!code || !name || codes.has(code)) throw new Error(`ชื่อหรือรหัสโครงการ ${idx + 1} ไม่ถูกต้อง/ซ้ำกัน`);
    codes.add(code);
    const status = s("status") as ProjectStatus;
    if (!statuses.includes(status)) throw new Error(`สถานะรายการ ${idx + 1} ไม่ถูกต้อง`);
    return {
      code, name, agency: s("agency", 250), budget: n("budget"), approved: n("approved"),
      allocated: n("allocated"), unapproved: n("unapproved"), unallocated: n("unallocated"),
      status, reference: s("reference", 400), note: s("note", 1500),
    };
  });
}

export function parseReportedTotals(value: unknown): BudgetTotals | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") throw new Error("ยอดรวมตามบัญชีไม่ถูกต้อง");
  const raw = value as Record<string, unknown>;
  const obj = {} as Record<keyof BudgetTotals, number>;
  for (const key of ["budget", "approved", "allocated", "unapproved", "unallocated"] as const) {
    const n = raw[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e13) throw new Error(`ยอดรวม ${key} ไม่ถูกต้อง`);
    obj[key] = Math.round(n * 100) / 100;
  }
  return obj;
}
