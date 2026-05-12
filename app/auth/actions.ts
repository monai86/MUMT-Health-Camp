"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@prisma/client";
import { z } from "zod";
import { clearSession, createSession, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const signupSchema = z.object({
  name: z.string().trim().min(2, "กรุณากรอกชื่อ"),
  email: z.string().trim().email("อีเมลไม่ถูกต้อง").toLowerCase(),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  projectId: z.string().min(1, "กรุณาเลือก Project"),
  departmentId: z.string().min(1, "กรุณาเลือกตำแหน่ง")
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1)
});

export async function signupAction(_: unknown, formData: FormData) {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ข้อมูลสมัครไม่ถูกต้อง" };
  }

  const department = await db.department.findFirst({
    where: { id: parsed.data.departmentId, projectId: parsed.data.projectId, active: true, project: { active: true } }
  });
  if (!department) return { error: "ไม่พบตำแหน่งที่เลือก" };

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "อีเมลนี้ถูกใช้งานแล้ว" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      departmentId: department.id,
      role: Role.ADMIN,
      status: UserStatus.PENDING
    }
  });

  redirect("/login?registered=1");
}

export async function loginAction(_: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  if (user.status === UserStatus.REJECTED || user.status === UserStatus.DISABLED) {
    return { error: "บัญชีนี้ไม่สามารถใช้งานได้ กรุณาติดต่อผู้ดูแลระบบ" };
  }

  await createSession(user.id);
  if (user.status === UserStatus.PENDING) redirect("/pending");
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function leavePendingAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await clearSession();
  redirect("/login");
}
