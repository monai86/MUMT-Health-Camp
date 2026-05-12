"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { LogIn, UserPlus } from "lucide-react";
import { loginAction, signupAction } from "@/app/auth/actions";

type PositionOption = {
  id: string;
  name: string;
};

type ProjectOption = {
  id: string;
  name: string;
  departments: PositionOption[];
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="panel section-stack">
      <div>
        <h1>เข้าสู่ระบบ</h1>
        <p className="muted">ใช้บัญชีที่ได้รับอนุมัติเพื่อกรอกข้อมูลตามตำแหน่งของคุณ</p>
      </div>
      {state?.error ? <div className="notice">{state.error}</div> : null}
      <label>
        อีเมล
        <input name="email" type="email" placeholder="admin@example.com" required />
      </label>
      <label>
        รหัสผ่าน
        <input name="password" type="password" placeholder="อย่างน้อย 8 ตัวอักษร" required />
      </label>
      <button className="button" type="submit" disabled={pending}>
        <LogIn size={16} />
        {pending ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"}
      </button>
      <p className="muted">
        ยังไม่มีบัญชี? <Link href="/signup">สมัครและเลือกตำแหน่ง</Link>
      </p>
    </form>
  );
}

export function SignupForm({ projects }: { projects: ProjectOption[] }) {
  const [state, formAction, pending] = useActionState(signupAction, null);
  const defaultProjectId = projects[0]?.id ?? "";
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId);
  const positions = useMemo(() => projects.find((project) => project.id === selectedProjectId)?.departments ?? [], [projects, selectedProjectId]);

  return (
    <form action={formAction} className="panel section-stack">
      <div>
        <h1>สมัครสมาชิก</h1>
        <p className="muted">เลือกตำแหน่งใน Project แล้วรอ Super Admin อนุมัติก่อนเริ่มกรอกข้อมูล</p>
      </div>
      {state?.error ? <div className="notice">{state.error}</div> : null}
      <label>
        ชื่อผู้ใช้
        <input name="name" placeholder="ชื่อ-นามสกุล" required />
      </label>
      <label>
        อีเมล
        <input name="email" type="email" placeholder="you@example.com" required />
      </label>
      <label>
        Project
        <select name="projectId" required value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
          <option value="" disabled>
            เลือก Project
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        ตำแหน่ง
        <select name="departmentId" required defaultValue="" key={selectedProjectId}>
          <option value="" disabled>
            เลือกตำแหน่ง
          </option>
          {positions.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        รหัสผ่าน
        <input name="password" type="password" minLength={8} required />
      </label>
      <button className="button" type="submit" disabled={pending}>
        <UserPlus size={16} />
        {pending ? "กำลังสมัคร" : "สมัครสมาชิก"}
      </button>
      <p className="muted">
        มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link>
      </p>
    </form>
  );
}
