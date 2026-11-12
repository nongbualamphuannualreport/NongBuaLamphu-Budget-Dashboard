"""Convert the province's FY2570 allocation workbook into a one-row-per-project seed.

Install openpyxl and run: python scripts/build_seed.py path/to/workbook.xlsx
The source remains authoritative; ambiguous or inconsistent cells are NOT corrected.
"""

import json
import sys
from pathlib import Path

from openpyxl import load_workbook


def amount(value):
    if isinstance(value, (float, int)):
        return value
    return 0


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/build_seed.py <source.xlsx>")
    source = Path(sys.argv[1])
    sheet = load_workbook(source, read_only=True, data_only=True).worksheets[0]
    rows = list(sheet.iter_rows(values_only=True))
    summary_row = next((r for r in rows if str(r[1]).strip() == "รวมทั้งสิ้น"), None)
    if summary_row is None:
        raise SystemExit("The source workbook has no 'รวมทั้งสิ้น' row")
    project_indices = [idx for idx, row in enumerate(rows) if isinstance(row[0], int)]
    projects = []
    for n, idx in enumerate(project_indices):
        row = rows[idx]
        end = project_indices[n + 1] if n + 1 < len(project_indices) else next(
            (k for k in range(idx + 1, len(rows)) if str(rows[k][1]).strip() == "รวมทั้งสิ้น"),
            len(rows),
        )
        details = rows[idx + 1 : end]
        agencies = []
        references = []
        for sub in details:
            agency = sub[11] or sub[4]
            if agency and str(agency).strip() not in agencies:
                agencies.append(str(agency).strip())
            reference = sub[13]
            if reference and str(reference).strip() not in references:
                references.append(str(reference).strip())
        budget, approved, allocated, unapproved, unallocated = (
            amount(row[col]) for col in (5, 7, 8, 9, 10)
        )
        if str(row[1]).strip() == "เงินเหลือจ่าย":
            status = "reserve"
        elif approved > 0 and unapproved > 0:
            status = "mixed"
        elif approved > 0:
            status = "approved"
        else:
            status = "pending"
        projects.append(
            dict(
                code=str(row[0]),
                name=str(row[1]).strip().replace("\n", " "),
                agency=" / ".join(agencies)[:250],
                budget=budget,
                approved=approved,
                allocated=allocated,
                unapproved=unapproved,
                unallocated=unallocated,
                status=status,
                reference="; ".join(references)[:400],
                note="นำเข้าจากบัญชีจัดสรรงบประมาณ (โปรดตรวจสอบยอดรายโครงการ)",
            )
        )
    result = dict(
        asOfDate="2026-10-15",
        published=False,
        items=projects,
        reportedTotals={
            "budget": amount(summary_row[5]),
            "approved": amount(summary_row[7]),
            "allocated": amount(summary_row[8]),
            "unapproved": amount(summary_row[9]),
            "unallocated": amount(summary_row[10]),
        },
        source="บัญชีจัดสรรงบประมาณ พ.ศ. 2570 งวดที่ 1 (ชีตหลัก; หมายเหตุ ณ 15 ต.ค. 2569)",
        demo=True,
    )
    target = Path(__file__).resolve().parents[1] / "data" / "seed.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created {target} with {len(projects)} records; figures are unchanged from the source")


if __name__ == "__main__":
    main()
