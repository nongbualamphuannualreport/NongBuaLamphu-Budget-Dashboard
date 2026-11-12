export type ProjectStatus = "approved" | "pending" | "mixed" | "reserve";

export type BudgetItem = {
  code: string;
  name: string;
  agency: string;
  budget: number;
  approved: number;
  allocated: number;
  unapproved: number;
  unallocated: number;
  status: ProjectStatus;
  reference: string;
  note: string;
};

export type BudgetReport = {
  asOfDate: string;
  published: boolean;
  items: BudgetItem[];
  source: string;
  reportedTotals: BudgetTotals | null;
  demo: boolean;
};

export type BudgetTotals = {
  budget: number;
  approved: number;
  allocated: number;
  unapproved: number;
  unallocated: number;
};

export type ReportMode = "daily" | "monthly";

export type ReportQuery = { mode: ReportMode; date: string };
