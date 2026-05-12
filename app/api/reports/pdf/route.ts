import { NextResponse } from "next/server";
import { buildHealthReportDocx, convertDocxBufferToPdf, getReportRecord, prepareReportData, reportFileName } from "@/lib/reports/docx";
import { requireApprovedUser } from "@/lib/auth";
import { resolveProjectForUser } from "@/lib/projects";

export async function GET(request: Request) {
  if (process.env.ENABLE_PDF_EXPORT !== "true") {
    return new NextResponse("PDF export is disabled on this deployment. Download DOCX instead.", { status: 503 });
  }

  const user = await requireApprovedUser();
  const url = new URL(request.url);
  const recordId = url.searchParams.get("recordId");
  const requestedProjectId = url.searchParams.get("projectId") ?? undefined;
  if (!recordId) return new NextResponse("Missing recordId", { status: 400 });

  const { project } = await resolveProjectForUser(user, requestedProjectId);
  if (!project) return new NextResponse("No project", { status: 404 });

  const record = await getReportRecord(recordId, project.id);
  if (!record) return new NextResponse("No record", { status: 404 });

  try {
    const data = prepareReportData(record);
    const docxBuffer = await buildHealthReportDocx(record, { data });
    const pdfBuffer = await convertDocxBufferToPdf(docxBuffer);
    const filename = reportFileName(record, data).replace(/\.docx$/i, ".pdf");

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้าง PDF ไม่สำเร็จ";
    return new NextResponse(message, { status: 503 });
  }
}
