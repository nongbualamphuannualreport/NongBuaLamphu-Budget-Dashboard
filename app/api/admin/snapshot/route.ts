import { NextRequest, NextResponse } from "next/server";
import { initialReport } from "@/lib/seed";
import { isConfigured, serverDb, verifyAdmin } from "@/lib/supabase";
import { qualityWarnings } from "@/lib/report";
import { isValidDate, parseBudgetItems, parseReportedTotals } from "@/lib/validation";
import type { BudgetItem, BudgetReport } from "@/lib/types";

export const dynamic = "force-dynamic";

async function guard(request: NextRequest) {
  if (!isConfigured()) return { error: NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 }) };
  const user = await verifyAdmin(request.headers.get("authorization"));
  if (!user) return { error: NextResponse.json({ error: "ไม่ได้รับอนุญาตสำหรับหลังบ้าน" }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  const date = request.nextUrl.searchParams.get("date");
  if (!isValidDate(date)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
  const db = serverDb();
  const { data: head, error } = await db.from("budget_snapshots")
    .select("id,as_of_date,published,source,reported_totals").lte("as_of_date", date)
    .order("as_of_date", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!head) return NextResponse.json({ report: initialReport(), copiedFrom: null, exists: false });
  const { data: rows, error: itemError } = await db.from("budget_items")
    .select("code,name,agency,budget,approved,allocated,unapproved,unallocated,status,reference,note")
    .eq("snapshot_id", head.id).order("position");
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  const report: BudgetReport = {
    asOfDate: head.as_of_date, published: head.as_of_date === date && head.published,
    source: head.source, reportedTotals: head.reported_totals, demo: false,
    items: (rows ?? []).map((r) => ({ ...r,
      budget: Number(r.budget), approved: Number(r.approved), allocated: Number(r.allocated),
      unapproved: Number(r.unapproved), unallocated: Number(r.unallocated),
    })) as BudgetItem[],
  };
  return NextResponse.json({ report, copiedFrom: head.as_of_date === date ? null : head.as_of_date, exists: head.as_of_date === date });
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isValidDate(body.date)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    if (typeof body.published !== "boolean") return NextResponse.json({ error: "สถานะเผยแพร่ไม่ถูกต้อง" }, { status: 400 });
    const items = parseBudgetItems(body.items);
    const reportedTotals = parseReportedTotals(body.reportedTotals);
    if (body.published && !reportedTotals) {
      return NextResponse.json({ error: "กรุณาระบุยอดรวมตามบัญชีต้นทางก่อนเผยแพร่" }, { status: 422 });
    }
    const warnings = qualityWarnings(items, reportedTotals);
    if (body.published && warnings.length) {
      return NextResponse.json({ error: "โปรดแก้ความคลาดเคลื่อนก่อนเผยแพร่", warnings }, { status: 422 });
    }
    const db = serverDb();
    const { error, data } = await db.rpc("replace_budget_snapshot", {
      p_as_of_date: body.date,
      p_published: body.published,
      p_source: typeof body.source === "string" ? body.source.slice(0, 500) : "เจ้าหน้าที่ปรับปรุงข้อมูล",
      p_reported_totals: reportedTotals,
      p_items: items,
      p_author: auth.user!.id,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data, warnings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
}
