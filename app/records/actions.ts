"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { defaultColumnDefinitions, isBmiColumn, isHeightColumn, isIdHeader, isWeightColumn, normalizeColumnKey, normalizeHeaderLabel } from "@/lib/columns";
import { db } from "@/lib/db";
import { asNumber, asString } from "@/lib/format";
import { requireApprovedUser, requireSuperAdmin, userCanEditColumn } from "@/lib/auth";

const recordIdSchema = z.string().trim().min(1, "กรุณากรอก ID").max(80);

const fixedFieldKeys = new Set(defaultColumnDefinitions.map((column) => column.key));

function stringifyAuditValue(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function coerceFixedValue(columnKey: string, value: string | null) {
  if (value === null) return null;
  if (columnKey === "age") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  }
  if (columnKey === "weightKg" || columnKey === "heightCm") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return value;
}

function fixedRecordPatch(columnKey: string, value: string | null) {
  if (!fixedFieldKeys.has(columnKey)) return {};
  return { [columnKey]: coerceFixedValue(columnKey, value) };
}

async function writeCell({
  userId,
  recordId,
  columnId,
  columnKey,
  value
}: {
  userId: string;
  recordId: string;
  columnId: string;
  columnKey: string;
  value: string | null;
}) {
  const existing = await db.recordCellValue.findUnique({
    where: { recordId_columnId: { recordId, columnId } }
  });
  const previous = existing?.value ?? null;

  if (previous === value) return false;

  await db.$transaction([
    db.record.update({
      where: { id: recordId },
      data: {
        ...fixedRecordPatch(columnKey, value),
        updatedById: userId
      }
    }),
    db.recordCellValue.upsert({
      where: { recordId_columnId: { recordId, columnId } },
      update: { value },
      create: { recordId, columnId, value }
    }),
    db.auditLog.create({
      data: {
        userId,
        recordId,
        columnKey,
        oldValue: stringifyAuditValue(previous),
        newValue: stringifyAuditValue(value)
      }
    })
  ]);

  return true;
}

function formatBmi(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const bmi = weightKg / (heightCm / 100) ** 2;
  return Number.isFinite(bmi) ? bmi.toFixed(2) : null;
}

async function syncCalculatedBmiForRecord({
  userId,
  projectId,
  recordId
}: {
  userId: string;
  projectId: string | null;
  recordId: string;
}) {
  if (!projectId) return;

  const columns = await db.recordColumn.findMany({
    where: { projectId, active: true },
    select: { id: true, key: true, label: true }
  });

  const bmiColumn = columns.find((column) => isBmiColumn(column.label, column.key));
  const weightColumn = columns.find((column) => isWeightColumn(column.label, column.key));
  const heightColumn = columns.find((column) => isHeightColumn(column.label, column.key));
  if (!bmiColumn || !weightColumn || !heightColumn) return;

  const sourceCells = await db.recordCellValue.findMany({
    where: {
      recordId,
      columnId: { in: [weightColumn.id, heightColumn.id, bmiColumn.id] }
    },
    select: { columnId: true, value: true }
  });
  const byColumnId = new Map(sourceCells.map((cell) => [cell.columnId, cell.value]));
  const bmiValue = formatBmi(asNumber(byColumnId.get(weightColumn.id)), asNumber(byColumnId.get(heightColumn.id)));

  await writeCell({
    userId,
    recordId,
    columnId: bmiColumn.id,
    columnKey: bmiColumn.key,
    value: bmiValue
  });
}

export async function createRecordAction(_: unknown, formData: FormData) {
  const user = await requireApprovedUser();
  const projectId = asString(formData.get("projectId")) ?? user.department?.projectId ?? null;
  if (!projectId) return { error: "กรุณาเลือก Project" };
  if (user.role !== Role.SUPER_ADMIN && user.department?.projectId !== projectId) return { error: "คุณไม่มีสิทธิ์เพิ่มข้อมูลใน Project นี้" };
  const project = await db.project.findFirst({ where: { id: projectId, active: true } });
  if (!project) return { error: "ไม่พบ Project" };

  const columns = await db.recordColumn.findMany({ where: { projectId, active: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const allowedColumns = columns.filter((column) => user.role === Role.SUPER_ADMIN || userCanEditColumn(user, column.key));
  const count = await db.record.count({ where: { projectId } });
  const id = `${projectId}-${String(count + 1).padStart(6, "0")}`;

  const cellInputs = [];
  const fixedPatch: Record<string, string | number | null> = {};
  for (const column of allowedColumns) {
    const value = asString(formData.get(column.id));
    if (value !== null) {
      cellInputs.push({ column, value });
      Object.assign(fixedPatch, fixedRecordPatch(column.key, value));
    }
  }

  await db.$transaction([
    db.record.create({
      data: {
        id,
        projectId,
        ...fixedPatch,
        createdById: user.id,
        updatedById: user.id
      }
    }),
    ...(cellInputs.length
      ? [
          db.recordCellValue.createMany({
            data: cellInputs.map(({ column, value }) => ({
              recordId: id,
              columnId: column.id,
              value
            }))
          }),
          db.auditLog.createMany({
            data: cellInputs.map(({ column, value }) => ({
              userId: user.id,
              recordId: id,
              columnKey: column.key,
              oldValue: null,
              newValue: stringifyAuditValue(value)
            }))
          })
        ]
      : [])
  ]);

  await syncCalculatedBmiForRecord({ userId: user.id, projectId, recordId: id });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateRecordAction(_: unknown, formData: FormData) {
  const user = await requireApprovedUser();
  const recordId = recordIdSchema.safeParse(formData.get("recordId"));
  const columnId = asString(formData.get("columnId"));
  if (!recordId.success || !columnId) return { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };

  const [record, column] = await Promise.all([
    db.record.findUnique({ where: { id: recordId.data } }),
    db.recordColumn.findUnique({ where: { id: columnId } })
  ]);

  if (!record) return { error: "ไม่พบรายการข้อมูล" };
  if (!column || !column.active) return { error: "ไม่พบคอลัมน์ข้อมูล" };
  if (isBmiColumn(column.label, column.key)) return { error: "BMI คำนวณอัตโนมัติจากส่วนสูงและน้ำหนัก" };
  if (user.role !== Role.SUPER_ADMIN && record.projectId !== user.department?.projectId) return { error: "คุณไม่มีสิทธิ์แก้ไข Project นี้" };
  if (!userCanEditColumn(user, column.key)) return { error: "คุณไม่มีสิทธิ์แก้ไขคอลัมน์นี้" };

  await writeCell({
    userId: user.id,
    recordId: record.id,
    columnId: column.id,
    columnKey: column.key,
    value: asString(formData.get("value"))
  });
  if (isWeightColumn(column.label, column.key) || isHeightColumn(column.label, column.key)) {
    await syncCalculatedBmiForRecord({ userId: user.id, projectId: record.projectId, recordId: record.id });
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function importCsvAction(_: unknown, formData: FormData) {
  const user = await requireSuperAdmin();
  const file = formData.get("csvFile");
  if (!(file instanceof File) || file.size === 0) return { error: "กรุณาเลือกไฟล์ CSV" };

  const csvText = await file.text();
  let rows: string[][];
  try {
    rows = parse(csvText, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    });
  } catch {
    return { error: "อ่านไฟล์ CSV ไม่สำเร็จ กรุณาตรวจรูปแบบไฟล์" };
  }

  if (rows.length < 2) return { error: "CSV ต้องมี header และข้อมูลอย่างน้อย 1 แถว" };

  const headers = rows[0].map(normalizeHeaderLabel);
  const idIndex = headers.findIndex(isIdHeader);
  const usedKeys = new Set<string>();
  const columnInputs = headers
    .map((label, index) => ({ label, index }))
    .filter((header) => header.label && header.index !== idIndex)
    .map((header) => {
      const baseKey = normalizeColumnKey(header.label);
      let key = baseKey;
      let suffix = 2;
      while (usedKeys.has(key)) {
        key = `${baseKey}_${suffix}`;
        suffix += 1;
      }
      usedKeys.add(key);
      return { ...header, key };
    });

  if (!columnInputs.length) return { error: "ไม่พบคอลัมน์ข้อมูลสำหรับ import" };

  let importedRows = 0;
  let importedCells = 0;

  const targetProjectId = asString(formData.get("projectId"));
  const projectName = (asString(formData.get("projectName")) ?? file.name.replace(/\.csv$/i, "")) || "CSV Project";
  const existingProject = targetProjectId
    ? await db.project.findFirst({ where: { id: targetProjectId, active: true } })
    : null;

  if (targetProjectId && !existingProject) return { error: "ไม่พบ Project ที่เลือก" };

  await db.$transaction(async (tx) => {
    const project = existingProject
      ? await tx.project.update({ where: { id: existingProject.id }, data: { name: asString(formData.get("projectName")) ?? existingProject.name } })
      : await tx.project.create({
          data: {
            name: projectName
          }
        });

    const records = await tx.record.findMany({ where: { projectId: project.id }, select: { id: true } });
    const recordIds = records.map((record) => record.id);
    if (recordIds.length) {
      await tx.auditLog.deleteMany({ where: { recordId: { in: recordIds } } });
      await tx.recordCellValue.deleteMany({ where: { recordId: { in: recordIds } } });
      await tx.record.deleteMany({ where: { id: { in: recordIds } } });
    }
    await tx.recordColumn.deleteMany({ where: { projectId: project.id } });

    const columns = [];
    for (const [position, input] of columnInputs.entries()) {
      const column = await tx.recordColumn.create({
        data: {
          projectId: project.id,
          key: input.key,
          label: input.label,
          type: "text",
          active: true,
          position
        }
      });
      columns.push({ ...input, id: column.id });
    }

    const usedRecordIds = new Map<string, number>();
    let generatedId = 1;

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      let recordId = `${project.id}-${String(generatedId).padStart(6, "0")}`;
      generatedId += 1;

      const seenCount = usedRecordIds.get(recordId) ?? 0;
      usedRecordIds.set(recordId, seenCount + 1);
      if (seenCount > 0) {
        recordId = `${recordId}-${seenCount + 1}`;
      }

      const fixedPatch: Record<string, string | number | null> = {};
      for (const column of columns) {
        const value = asString(row[column.index]);
        if (value !== null) Object.assign(fixedPatch, fixedRecordPatch(column.key, value));
      }

      await tx.record.create({
        data: {
          id: recordId,
          projectId: project.id,
          ...fixedPatch,
          createdById: user.id,
          updatedById: user.id
        }
      });
      importedRows += 1;

      for (const column of columns) {
        const value = asString(row[column.index]);
        if (value === null) continue;
        await tx.recordCellValue.create({
          data: {
            recordId,
            columnId: column.id,
            value
          }
        });
        importedCells += 1;
      }
      await syncCalculatedBmiForRecord({ userId: user.id, projectId: project.id, recordId });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${existingProject ? "อัปเดต" : "สร้าง"} Project "${existingProject?.name ?? projectName}" สำเร็จ: ${importedRows} แถว, ${columnInputs.length} คอลัมน์, ${importedCells} เซลล์`
  };
}
