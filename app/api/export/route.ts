import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApprovedUser } from "@/lib/auth";
import { resolveProjectForUser } from "@/lib/projects";

export async function GET(request: Request) {
  const user = await requireApprovedUser();
  const requestedProjectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const { project } = await resolveProjectForUser(user, requestedProjectId);
  if (!project) return new NextResponse("No project", { status: 404 });

  const [columns, records] = await Promise.all([
    db.recordColumn.findMany({ where: { projectId: project.id, active: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    db.record.findMany({ where: { projectId: project.id }, include: { cellValues: true }, orderBy: { id: "asc" } })
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ชีต1");

  sheet.columns = [
    ...columns.map((column) => ({ header: column.label, key: column.id, width: Math.max(16, Math.min(28, column.label.length * 2)) }))
  ];
  sheet.getRow(1).font = { bold: true };

  for (const record of records) {
    const row: Record<string, string | null> = {};
    for (const cell of record.cellValues) {
      row[cell.columnId] = cell.value;
    }
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="department-records.xlsx"`
    }
  });
}
