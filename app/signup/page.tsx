import { SignupForm } from "@/components/AuthForms";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const projects = await db.project.findMany({
    where: { active: true, departments: { some: { active: true } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      departments: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true }
      }
    }
  });

  return (
    <main className="auth-grid">
      <section className="auth-intro">
        <div>
          <h1>สมัครตามตำแหน่งใน Project</h1>
          <p>เลือกตำแหน่งของ Project ที่ต้องการกรอกข้อมูล แล้วรอ Super Admin อนุมัติ</p>
        </div>
      </section>
      <SignupForm projects={projects} />
    </main>
  );
}
