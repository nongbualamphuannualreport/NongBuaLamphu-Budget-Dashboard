import { NextRequest, NextResponse } from "next/server";
import { initialReport } from "@/lib/seed";
import { reportCutoff } from "@/lib/report";
import { isConfigured, publicDb } from "@/lib/supabase";
import { isValidDate } from "@/lib/validation";
import type { BudgetReport, BudgetItem, ReportMode } from "@/lib/types";

export const dynamic = "force-dynamic";

function mapItems(rows: Record<string, unknown>[]): BudgetItem[] {
  return rows.map((row) => ({
    code: String(row.code), name: String(row.name), agency: String(row.agency ?? ""),
    budget: Number(row.budget), approved: Number(row.approved), allocated: Number(row.allocated),
    unapproved: Number(row.unapproved), unallocated: Number(row.unallocated),
    status: row.status as BudgetItem["status"],
    reference: String(row.reference ?? ""), note: String(row.note ?? ""),
  }));
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const mode = request.nextUrl.searchParams.get("mode") ?? "daily";
  if (!isValidDate(date) || (mode !== "daily" && mode !== "monthly")) {
    return NextResponse.json({ error: "ระบุวันที่หรือเดือนให้ถูกต้อง" }, { status: 400 });
  }
  const cutoff = reportCutoff({ date, mode: mode as ReportMode });
  if (!isConfigured()) {
    const demo = initialReport();
    return NextResponse.json({ report: demo.asOfDate <= cutoff ? demo : null, demo: true });
  }
  try {
    const db = publicDb();
    const { data: head, error: headError } = await db.from("budget_snapshots")
      .select("id,as_of_date,published,source,reported_totals")
      .lte("as_of_date", cutoff).eq("published", true)
      .order("as_of_date", { ascending: false }).limit(1).maybeSingle();
    if (headError) throw headError;
    if (!head) return NextResponse.json({ report: null, demo: false });
    const { data: rows, error: rowsError } = await db.from("budget_items")
      .select("code,name,agency,budget,approved,allocated,unapproved,unallocated,status,reference,note")
      .eq("snapshot_id", head.id).order("position");
    if (rowsError) throw rowsError;
    const report: BudgetReport = {
      asOfDate: head.as_of_date, published: true, source: head.source,
      reportedTotals: head.reported_totals,
      demo: false, items: mapItems((rows ?? []) as Record<string, unknown>[]),
    };
    return NextResponse.json({ report, demo: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลล่าสุดได้ กรุณาลองใหม่" }, { status: 503 });
  }
}
