import JSZip from "jszip";
import { NextResponse } from "next/server";
import { buildHealthReportDocx, prepareReportData, prepareReportTemplateContext, reportFileNameFromData } from "@/lib/reports/docx";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { resolveProjectForUser } from "@/lib/projects";

export async function GET(request: Request) {
  const user = await requireSuperAdmin();
  const url = new URL(request.url);
  const requestedProjectId = url.searchParams.get("projectId") ?? undefined;
  const q = url.searchParams.get("q")?.trim() ?? "";

  const { project } = await resolveProjectForUser(user, requestedProjectId);
  if (!project) return new NextResponse("No project", { status: 404 });

  const records = await db.record.findMany({
    where: q
      ? {
          projectId: project.id,
          cellValues: {
            some: {
              value: {
                contains: q
              }
            }
          }
        }
      : { projectId: project.id },
    select: {
      id: true,
      cellValues: {
        select: {
          value: true,
          column: {
            select: { label: true, key: true }
          }
        }
      }
    },
    orderBy: { id: "asc" },
    take: 500
  });

  const zip = new JSZip();
  const reportContext = await prepareReportTemplateContext();
  for (const record of records) {
    const data = prepareReportData(record);
    const report = await buildHealthReportDocx(record, { context: reportContext, data, compression: "STORE" });
    zip.file(reportFileNameFromData(record, data), report);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`reports-${project.name}.zip`)}`
    }
  });
}
