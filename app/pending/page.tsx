import { redirect } from "next/navigation";
import { leavePendingAction } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "APPROVED") redirect("/dashboard");

  return (
    <main className="auth-grid">
      <section className="auth-intro">
        <div>
          <h1>บัญชียังรออนุมัติ</h1>
          <p>บัญชีของคุณถูกบันทึกแล้ว แต่ยังไม่สามารถกรอกหรือแก้ไขข้อมูลได้จนกว่า Super Admin จะอนุมัติ</p>
        </div>
      </section>
      <section className="panel section-stack">
        <h1>{user.name}</h1>
        <p className="muted">สถานะบัญชี: {user.status}</p>
        <p className="muted">ตำแหน่ง: {user.department?.name ?? "ยังไม่ได้เลือกตำแหน่ง"}</p>
        <p className="muted">Project: {user.department?.project?.name ?? "-"}</p>
        <form action={leavePendingAction}>
          <button className="ghost-button" type="submit">
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </form>
      </section>
    </main>
  );
}
