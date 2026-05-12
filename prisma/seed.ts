import { PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultColumnDefinitions } from "../lib/columns";

const prisma = new PrismaClient();

const defaultPositions: Record<string, string[]> = {
  "ตำแหน่งลงชื่อ": ["firstName", "lastName", "csv_name", "csv_full_name", "csv_6e616d65"],
  "ตำแหน่งลงส่วนสูง": ["heightCm", "csv_height", "csv_e0b8aae0b988e0b8a7e0b899e0b8aae0b8b9e0b887"]
};

async function getOrCreateProject() {
  const existing =
    (await prisma.project.findFirst({ orderBy: { createdAt: "desc" } })) ??
    (await prisma.project.create({ data: { name: "Project เริ่มต้น" } }));

  await prisma.record.updateMany({ where: { projectId: null }, data: { projectId: existing.id } });
  await prisma.recordColumn.updateMany({ where: { projectId: null }, data: { projectId: existing.id } });
  await prisma.department.updateMany({ where: { projectId: null }, data: { projectId: existing.id } });
  return existing;
}

async function main() {
  const passwordHash = await bcrypt.hash("admin1234", 12);
  const project = await getOrCreateProject();

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: Role.SUPER_ADMIN, status: UserStatus.APPROVED },
    create: {
      name: "Super Admin",
      email: "admin@example.com",
      passwordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.APPROVED
    }
  });

  await prisma.user.updateMany({
    where: { email: "yutthayongmonai@gmail.com" },
    data: {
      role: Role.SUPER_ADMIN,
      status: UserStatus.APPROVED,
      departmentId: null
    }
  });

  await prisma.department.updateMany({
    where: { name: { startsWith: "ฝ่าย" } },
    data: { active: false }
  });

  const existingColumnCount = await prisma.recordColumn.count({ where: { projectId: project.id } });
  if (!existingColumnCount) {
    for (const column of defaultColumnDefinitions) {
      await prisma.recordColumn.create({
        data: {
          projectId: project.id,
          key: column.key,
          label: column.label,
          type: column.type,
          active: true,
          position: column.position ?? 0
        }
      });
    }
  }

  const projectColumns = await prisma.recordColumn.findMany({
    where: { projectId: project.id, active: true },
    select: { key: true }
  });
  const validColumnKeys = new Set(projectColumns.map((column) => column.key));

  for (const [name, columns] of Object.entries(defaultPositions)) {
    let position = await prisma.department.findFirst({ where: { projectId: project.id, name } });
    position ??= await prisma.department.create({ data: { projectId: project.id, name, active: true } });

    for (const columnKey of validColumnKeys) {
      await prisma.departmentPermission.upsert({
        where: { departmentId_columnKey: { departmentId: position.id, columnKey } },
        update: { canEdit: columns.includes(columnKey) },
        create: { departmentId: position.id, columnKey, canEdit: columns.includes(columnKey) }
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
