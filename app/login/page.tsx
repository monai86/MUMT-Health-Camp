import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const user = await getCurrentUser();
  if (user?.status === "APPROVED") redirect("/dashboard");
  const params = await searchParams;

  return (
    <main className="auth-grid">
      <section className="auth-intro">
        <div>
          <h1>ข้อมูล Excel กลายเป็นระบบทำงานร่วมกัน</h1>
          <p>ล็อกอินเพื่อกรอกเฉพาะข้อมูลที่ฝ่ายของคุณดูแล พร้อมประวัติการแก้ไขและ export กลับเป็น Excel</p>
          {params.registered ? <p className="notice">สมัครสำเร็จแล้ว กรุณารอ Super Admin อนุมัติบัญชี</p> : null}
        </div>
      </section>
      <LoginForm />
    </main>
  );
}
