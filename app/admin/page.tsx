import { Check, PauseCircle, ShieldOff, Trash2, X } from "lucide-react";
import { UserStatus } from "@prisma/client";
import { deleteProjectAction, updateDepartmentPermissionsAction, toggleDepartmentAction, updateUserDepartmentAction, updateUserStatusAction } from "@/app/admin/actions";
import { AppShell } from "@/components/AppShell";
import { CreateDepartmentForm, CreateProjectForm } from "@/components/AdminForms";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

const statusLabel: Record<UserStatus, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ปฏิเสธ",
  DISABLED: "ปิดใช้งาน"
};

export default async function AdminPage() {
  const user = await requireSuperAdmin();
  const [users, projects, departments, logs] = await Promise.all([
    db.user.findMany({
      include: { department: { include: { project: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    }),
    db.project.findMany({
      where: { active: true },
      include: {
        columns: { where: { active: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        _count: { select: { records: true, columns: true, departments: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.department.findMany({
      include: { project: true, permissions: true, _count: { select: { users: true } } },
      orderBy: [{ project: { createdAt: "desc" } }, { name: "asc" }]
    }),
    db.auditLog.findMany({
      include: { user: true, record: true },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);
  const activePositions = departments.filter((department) => department.active && department.project?.active);

  return (
    <AppShell user={user}>
      <main className="container section-stack">
        <section className="panel">
          <h1>ผู้ดูแลระบบ</h1>
          <p className="muted">อนุมัติผู้ใช้ จัดการตำแหน่งในแต่ละ Project และกำหนดคอลัมน์ที่แต่ละตำแหน่งแก้ไขได้</p>
        </section>

        <section className="panel section-stack">
          <div>
            <h2>ผู้ใช้</h2>
            <p className="muted">ผู้สมัครใหม่จะเป็นสถานะรออนุมัติ และยังแก้ข้อมูลไม่ได้</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>อีเมล</th>
                  <th>Project / ตำแหน่ง</th>
                  <th>บทบาท</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.email}</td>
                    <td>{account.department ? `${account.department.project?.name ?? "-"} · ${account.department.name}` : "-"}</td>
                    <td>{account.role}</td>
                    <td>
                      <span className={`badge ${account.status.toLowerCase()}`}>{statusLabel[account.status]}</span>
                    </td>
                    <td>
                      <div className="actions">
                        <form action={updateUserDepartmentAction} className="actions">
                          <input type="hidden" name="userId" value={account.id} />
                          <select name="departmentId" defaultValue={account.departmentId ?? ""}>
                            <option value="">ไม่กำหนดตำแหน่ง</option>
                            {activePositions.map((position) => (
                              <option key={position.id} value={position.id}>
                                {position.project?.name ?? "-"} · {position.name}
                              </option>
                            ))}
                          </select>
                          <button className="ghost-button" type="submit">
                            บันทึกตำแหน่ง
                          </button>
                        </form>
                        <form action={updateUserStatusAction}>
                          <input type="hidden" name="userId" value={account.id} />
                          <input type="hidden" name="status" value="APPROVED" />
                          <button className="ghost-button" title="อนุมัติ" type="submit">
                            <Check size={16} />
                          </button>
                        </form>
                        <form action={updateUserStatusAction}>
                          <input type="hidden" name="userId" value={account.id} />
                          <input type="hidden" name="status" value="REJECTED" />
                          <button className="ghost-button" title="ปฏิเสธ" type="submit">
                            <X size={16} />
                          </button>
                        </form>
                        <form action={updateUserStatusAction}>
                          <input type="hidden" name="userId" value={account.id} />
                          <input type="hidden" name="status" value="DISABLED" />
                          <button className="ghost-button" title="ปิดใช้งาน" type="submit">
                            <ShieldOff size={16} />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel section-stack">
          <div>
            <h2>Project</h2>
            <p className="muted">Super Admin สามารถเพิ่ม Project เปล่า หรือลบ Project พร้อมข้อมูล CSV, คอลัมน์, ตำแหน่ง และสิทธิ์ของ Project นั้น</p>
          </div>
          <CreateProjectForm />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>แถวข้อมูล</th>
                  <th>คอลัมน์</th>
                  <th>ตำแหน่ง</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project._count.records}</td>
                    <td>{project._count.columns}</td>
                    <td>{project._count.departments}</td>
                    <td>
                      <form action={deleteProjectAction}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <button className="ghost-button" type="submit" title="ลบ Project">
                          <Trash2 size={16} />
                          ลบ Project
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!projects.length ? (
                  <tr>
                    <td colSpan={5}>ยังไม่มี Project</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel section-stack">
          <div>
            <h2>ตำแหน่งและสิทธิ์คอลัมน์</h2>
            <p className="muted">ตำแหน่งจะเปิดรับสมัครเฉพาะ Project ของ CSV นั้น และแก้ได้เฉพาะคอลัมน์ที่กำหนด</p>
          </div>
          <CreateDepartmentForm projects={projects.map((project) => ({ id: project.id, name: project.name }))} />
          <div className="section-stack">
            {departments.map((department) => {
              const allowed = new Set(department.permissions.filter((permission) => permission.canEdit).map((permission) => permission.columnKey));
              const columns = projects.find((project) => project.id === department.projectId)?.columns ?? [];
              return (
                <div className="permission-row" key={department.id}>
                  <div className="actions" style={{ justifyContent: "space-between" }}>
                    <div>
                      <h3>{department.name}</h3>
                      <p className="muted">
                        Project: {department.project?.name ?? "-"} · ผู้ใช้ {department._count.users} คน · {department.active ? "เปิดให้เลือกตอนสมัคร" : "ปิดไม่ให้เลือกตอนสมัคร"}
                      </p>
                    </div>
                    <form action={toggleDepartmentAction}>
                      <input type="hidden" name="departmentId" value={department.id} />
                      <input type="hidden" name="active" value={department.active ? "false" : "true"} />
                      <button className="ghost-button" type="submit">
                        <PauseCircle size={16} />
                        {department.active ? "ปิดฝ่าย" : "เปิดฝ่าย"}
                      </button>
                    </form>
                  </div>
                  <form action={updateDepartmentPermissionsAction} className="section-stack">
                    <input type="hidden" name="departmentId" value={department.id} />
                    <div className="checkbox-grid">
                      {columns.map((column) => (
                        <label key={column.key}>
                          <input name="columns" type="checkbox" value={column.key} defaultChecked={allowed.has(column.key)} />
                          {column.label}
                        </label>
                      ))}
                    </div>
                    <button className="button" type="submit">
                      บันทึกสิทธิ์
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel section-stack">
          <div>
            <h2>ประวัติการแก้ไขล่าสุด</h2>
            <p className="muted">บันทึกทุกการแก้ไขฟิลด์ข้อมูลผ่านระบบ</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้ใช้</th>
                  <th>ID</th>
                  <th>คอลัมน์</th>
                  <th>จาก</th>
                  <th>เป็น</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.createdAt.toLocaleString("th-TH")}</td>
                    <td>{log.user.name}</td>
                    <td>{log.recordId}</td>
                    <td>{log.columnKey}</td>
                    <td>{log.oldValue ?? "-"}</td>
                    <td>{log.newValue ?? "-"}</td>
                  </tr>
                ))}
                {!logs.length ? (
                  <tr>
                    <td colSpan={6}>ยังไม่มีประวัติการแก้ไข</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
