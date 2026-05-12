import Link from "next/link";
import { Database, Download, Search, ShieldCheck, Table2 } from "lucide-react";
import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { CreateRecordForm, ImportCsvForm, InlineEditForm } from "@/components/RecordForms";
import { LiveSearch } from "@/components/LiveSearch";
import { ReportDownloadLink } from "@/components/ReportDownloadLink";
import { db } from "@/lib/db";
import { displayValue } from "@/lib/format";
import { requireApprovedUser, userCanEditColumn } from "@/lib/auth";
import { resolveProjectForUser } from "@/lib/projects";

const PAGE_SIZE = 30;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ q?: string; projectId?: string; page?: string }> }) {
  const user = await requireApprovedUser();
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const { project, projects } = await resolveProjectForUser(user, params.projectId);

  if (!project) {
    return (
      <AppShell user={user}>
        <main className="container section-stack">
          <section className="panel">
            <h1>ยังไม่มี Project</h1>
            <p className="muted">ให้ Super Admin import CSV เพื่อสร้าง Project แรกก่อน จากนั้นจึงเพิ่มตำแหน่งและกำหนดสิทธิ์ได้</p>
          </section>
          {user.role === Role.SUPER_ADMIN ? <ImportCsvForm projects={projects.map((item) => ({ id: item.id, name: item.name }))} /> : null}
        </main>
      </AppShell>
    );
  }

  const columns = await db.recordColumn.findMany({
    where: { projectId: project.id, active: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }]
  });

  const editableKeys =
    user.role === Role.SUPER_ADMIN
      ? columns.map((column) => column.key)
      : user.department?.permissions.filter((permission) => permission.canEdit).map((permission) => permission.columnKey) ?? [];

  const recordWhere = q
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
    : { projectId: project.id };

  const [records, totalRecords] = await Promise.all([
    db.record.findMany({
      where: recordWhere,
      select: {
        id: true,
        cellValues: {
          select: {
            columnId: true,
            value: true
          }
        }
      },
      orderBy: { id: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    db.record.count({ where: recordWhere })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRecords = currentPage === page ? records : await db.record.findMany({
    where: recordWhere,
    select: {
      id: true,
      cellValues: {
        select: {
          columnId: true,
          value: true
        }
      }
    },
    orderBy: { id: "asc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });

  return (
    <AppShell user={user}>
      <main className="container section-stack">
        <section className="dashboard-hero">
          <div className="hero-copy">
            <span className="eyebrow">Project workspace</span>
            <h1>ตารางข้อมูลบุคคล</h1>
            <p>
              {project.name} · {user.role === Role.SUPER_ADMIN ? "Super Admin" : user.department?.name ?? "ยังไม่มีตำแหน่ง"}
            </p>
          </div>
          <div className="hero-toolbar">
            <form className="project-switcher">
                {user.role === Role.SUPER_ADMIN ? (
                  <select name="projectId" defaultValue={project.id}>
                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input type="hidden" name="page" value="1" />
                <input name="q" placeholder="ค้นหาข้อมูลใน CSV" defaultValue={params.q ?? ""} />
                <button className="ghost-button" type="submit">
                  <Search size={16} />
                  ค้นหา
                </button>
            </form>
            <div className="actions">
              <Link className="button" href={`/api/export?projectId=${project.id}`}>
                <Download size={16} />
                Export Excel
              </Link>
              {user.role === Role.SUPER_ADMIN ? (
                <ReportDownloadLink href={`/api/reports/docx/bulk?projectId=${project.id}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`} label="พิมพ์ DOCX รวม" />
              ) : null}
            </div>
          </div>
        </section>

        <section className="stats">
          <div className="stat">
            <Database size={18} />
            <span className="muted">รายการทั้งหมด</span>
            <strong>{totalRecords}</strong>
          </div>
          <div className="stat">
            <Table2 size={18} />
            <span className="muted">คอลัมน์</span>
            <strong>{columns.length}</strong>
          </div>
          <div className="stat">
            <ShieldCheck size={18} />
            <span className="muted">สิทธิ์คอลัมน์</span>
            <strong>{editableKeys.length}</strong>
          </div>
        </section>

        {user.role === Role.SUPER_ADMIN ? <ImportCsvForm projects={projects.map((item) => ({ id: item.id, name: item.name }))} /> : null}

        <CreateRecordForm projectId={project.id} columns={columns} editableKeys={editableKeys} />

        <section className="panel section-stack data-panel">
          <div className="table-heading">
            <div>
              <h2>ข้อมูลล่าสุด</h2>
              <p className="muted">
                {q
                  ? `พบ ${totalRecords} รายการ · หน้า ${currentPage}/${totalPages}`
                  : `แสดง ${pageRecords.length} จาก ${totalRecords} รายการ · หน้า ${currentPage}/${totalPages}`}
              </p>
            </div>
            <LiveSearch projectId={project.id} initialQuery={params.q ?? ""} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>รายงาน</th>
                  {columns.map((column) => (
                    <th key={column.id}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((record) => {
                  const valueByColumn = new Map(record.cellValues.map((cell) => [cell.columnId, cell.value]));
                  return (
                    <tr key={record.id}>
                      <td>
                        <div className="report-actions">
                          <ReportDownloadLink
                            className="icon-link"
                            href={`/api/reports/pdf?projectId=${project.id}&recordId=${record.id}`}
                            iconSize={18}
                            label="PDF"
                            title="เปิด PDF สำหรับพิมพ์"
                          />
                          <ReportDownloadLink
                            className="icon-link"
                            href={`/api/reports/docx?projectId=${project.id}&recordId=${record.id}`}
                            iconSize={18}
                            label="DOCX"
                            title="ดาวน์โหลดรายงาน DOCX"
                          />
                        </div>
                      </td>
                      {columns.map((column) => {
                        const value = valueByColumn.get(column.id) ?? null;
                        return (
                          <td key={column.id}>
                            {userCanEditColumn(user, column.key) ? (
                              <InlineEditForm
                                recordId={record.id}
                                columnId={column.id}
                                columnKey={column.key}
                                columnLabel={column.label}
                                value={value}
                              />
                            ) : (
                              <span title={`ไม่มีสิทธิ์แก้ไข ${column.label}`}>{displayValue(value)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {!pageRecords.length ? (
                  <tr>
                    <td colSpan={columns.length + 1}>ไม่พบข้อมูล</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div className="muted">หน้า {currentPage} จาก {totalPages}</div>
            <div className="pager">
              <Link
                aria-disabled={currentPage <= 1}
                className={`ghost-button${currentPage <= 1 ? " is-disabled" : ""}`}
                href={`/dashboard?projectId=${project.id}${q ? `&q=${encodeURIComponent(q)}` : ""}&page=${Math.max(1, currentPage - 1)}`}
                scroll={false}
              >
                ก่อนหน้า
              </Link>
              <Link
                aria-disabled={currentPage >= totalPages}
                className={`ghost-button${currentPage >= totalPages ? " is-disabled" : ""}`}
                href={`/dashboard?projectId=${project.id}${q ? `&q=${encodeURIComponent(q)}` : ""}&page=${Math.min(totalPages, currentPage + 1)}`}
                scroll={false}
              >
                ถัดไป
              </Link>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
