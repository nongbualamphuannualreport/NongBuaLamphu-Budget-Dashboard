import seed from "@/data/seed.json";
import type { BudgetReport } from "@/lib/types";

export function initialReport(): BudgetReport {
  return structuredClone(seed) as BudgetReport;
}
