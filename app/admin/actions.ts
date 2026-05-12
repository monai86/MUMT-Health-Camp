"use server";

import { revalidatePath } from "next/cache";
import { UserStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

const projectSchema = z.object({
  name: z.string().trim().min(2, "กรุณากรอกชื่อ Project")
});

const departmentSchema = z.object({
  name: z.string().trim().min(2, "กรุณากรอกชื่อตำแหน่ง"),
  projectId: z.string().min(1, "กรุณาเลือก Project")
});

export async function updateUserStatusAction(formData: FormData) {
  await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!Object.values(UserStatus).includes(status as UserStatus)) return;

  await db.user.update({
    where: { id: userId },
    data: { status: status as UserStatus }
  });
  revalidatePath("/admin");
}

export async function updateUserDepartmentAction(formData: FormData) {
  await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");

  if (!userId) return;
  if (!departmentId) {
    await db.user.update({ where: { id: userId }, data: { departmentId: null } });
  } else {
    const department = await db.department.findFirst({
      where: { id: departmentId, active: true, project: { active: true } }
    });
    if (!department) return;
    await db.user.update({ where: { id: userId }, data: { departmentId: department.id } });
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function createProjectAction(_: unknown, formData: FormData) {
  await requireSuperAdmin();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูล Project ไม่ถูกต้อง" };

  await db.project.create({ data: { name: parsed.data.name, active: true } });
  revalidatePath("/admin");
  revalidatePath("/signup");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteProjectAction(formData: FormData) {
  await requireSuperAdmin();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;

  await db.project.delete({ where: { id: projectId } });
  revalidatePath("/admin");
  revalidatePath("/signup");
  revalidatePath("/dashboard");
}

export async function createDepartmentAction(_: unknown, formData: FormData) {
  await requireSuperAdmin();
  const parsed = departmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลฝ่ายไม่ถูกต้อง" };

  const project = await db.project.findFirst({ where: { id: parsed.data.projectId, active: true } });
  if (!project) return { error: "ไม่พบ Project" };

  const existing = await db.department.findFirst({ where: { projectId: project.id, name: parsed.data.name } });
  if (existing) return { error: "มีตำแหน่งนี้ใน Project แล้ว" };

  await db.department.create({
    data: {
      name: parsed.data.name,
      projectId: project.id,
      permissions: {
        create: (await db.recordColumn.findMany({ where: { projectId: project.id, active: true }, select: { key: true } })).map((column) => ({ columnKey: column.key, canEdit: false }))
      }
    }
  });
  revalidatePath("/admin");
  revalidatePath("/signup");
  return { ok: true };
}

export async function toggleDepartmentAction(formData: FormData) {
  await requireSuperAdmin();
  const departmentId = String(formData.get("departmentId") ?? "");
  const active = String(formData.get("active")) === "true";

  await db.department.update({
    where: { id: departmentId },
    data: { active }
  });
  revalidatePath("/admin");
  revalidatePath("/signup");
}

export async function updateDepartmentPermissionsAction(formData: FormData) {
  await requireSuperAdmin();
  const departmentId = String(formData.get("departmentId") ?? "");
  const department = await db.department.findUnique({ where: { id: departmentId }, select: { projectId: true } });
  if (!department?.projectId) return;
  const allColumns = await db.recordColumn.findMany({ where: { projectId: department.projectId, active: true }, select: { key: true } });
  const validKeys = new Set(allColumns.map((column) => column.key));
  const selected = new Set(formData.getAll("columns").map(String).filter((key) => validKeys.has(key)));

  await db.$transaction(
    allColumns.map(({ key: columnKey }) =>
      db.departmentPermission.upsert({
        where: { departmentId_columnKey: { departmentId, columnKey } },
        update: { canEdit: selected.has(columnKey) },
        create: { departmentId, columnKey, canEdit: selected.has(columnKey) }
      })
    )
  );
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}
