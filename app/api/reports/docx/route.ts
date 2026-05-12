import { NextResponse } from "next/server";
import { buildHealthReportDocx, getReportRecord, prepareReportData, reportFileName } from "@/lib/reports/docx";
import { requireApprovedUser } from "@/lib/auth";
import { resolveProjectForUser } from "@/lib/projects";

export async function GET(request: Request) {
  const user = await requireApprovedUser();
  const url = new URL(request.url);
  const recordId = url.searchParams.get("recordId");
  const requestedProjectId = url.searchParams.get("projectId") ?? undefined;
  if (!recordId) return new NextResponse("Missing recordId", { status: 400 });

  const { project } = await resolveProjectForUser(user, requestedProjectId);
  if (!project) return new NextResponse("No project", { status: 404 });

  const record = await getReportRecord(recordId, project.id);
  if (!record) return new NextResponse("No record", { status: 404 });

  const data = prepareReportData(record);
  const buffer = await buildHealthReportDocx(record, { data });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName(record, data))}`
    }
  });
}
