"use client";

import { useActionState } from "react";
import { Check, FileUp, Plus, Save } from "lucide-react";
import { createRecordAction, importCsvAction, updateRecordAction } from "@/app/records/actions";
import { isBmiColumn } from "@/lib/columns";

type ColumnOption = {
  id: string;
  key: string;
  label: string;
  type: string;
};

export function ImportCsvForm({ projects = [] }: { projects?: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(importCsvAction, null);

  return (
    <form action={formAction} className="panel section-stack utility-panel">
      <div className="panel-title">
        <div className="title-icon">
          <FileUp size={18} />
        </div>
        <div>
          <h2>Import CSV</h2>
          <p className="muted">เลือก Project ที่มีอยู่เพื่อแทนที่ข้อมูลด้วย CSV ใหม่ หรือเว้นว่างแล้วกรอกชื่อเพื่อสร้าง Project ใหม่</p>
        </div>
      </div>
      {state?.error ? <div className="notice">{state.error}</div> : null}
      {state?.message ? <div className="notice">{state.message}</div> : null}
      <div className="form-grid compact-form-grid">
        <label>
          Import เข้า Project
          <select name="projectId" defaultValue="">
            <option value="">สร้าง Project ใหม่</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          ชื่อ Project ใหม่
          <input name="projectName" placeholder="เช่น รายชื่อรอบเดือนพฤษภาคม" />
        </label>
        <label>
          ไฟล์ CSV
          <input name="csvFile" type="file" accept=".csv,text/csv" required />
        </label>
      </div>
      <div className="actions panel-actions">
        <button className="button" type="submit" disabled={pending}>
          <FileUp size={16} />
          {pending ? "กำลัง import" : "Import CSV"}
        </button>
      </div>
    </form>
  );
}

export function CreateRecordForm({ projectId, columns, editableKeys }: { projectId: string; columns: ColumnOption[]; editableKeys: string[] }) {
  const [state, formAction, pending] = useActionState(createRecordAction, null);

  return (
    <form action={formAction} className="panel section-stack utility-panel">
      <div className="panel-title">
        <div className="title-icon">
          <Plus size={18} />
        </div>
        <div>
        <h2>เพิ่ม ID ใหม่</h2>
        <p className="muted">กรอก ID เอง ระบบจะกัน ID ซ้ำ และเปิดให้กรอกเฉพาะคอลัมน์ที่ฝ่ายนี้มีสิทธิ์</p>
        </div>
      </div>
      {state?.error ? <div className="notice">{state.error}</div> : null}
      {state?.ok ? <div className="notice">เพิ่มรายการแล้ว</div> : null}
      <div className="form-grid">
        <input type="hidden" name="projectId" value={projectId} />
        {columns.map((column) => (
          <label key={column.id}>
            {column.label}
            <input name={column.id} type="text" disabled={!editableKeys.includes(column.key) || isBmiColumn(column.label, column.key)} />
          </label>
        ))}
      </div>
      <div className="actions panel-actions">
        <button className="button" type="submit" disabled={pending}>
          <Plus size={16} />
          {pending ? "กำลังเพิ่ม" : "เพิ่มรายการ"}
        </button>
      </div>
    </form>
  );
}

export function InlineEditForm({
  recordId,
  columnId,
  columnKey,
  columnLabel,
  value
}: {
  recordId: string;
  columnId: string;
  columnKey: string;
  columnLabel: string;
  value: string | null;
}) {
  if (isBmiColumn(columnLabel, columnKey)) {
    return <span>{value ?? "-"}</span>;
  }

  const [state, formAction, pending] = useActionState(updateRecordAction, null);

  return (
    <form action={formAction} className="cell-edit">
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="columnId" value={columnId} />
      <input name="value" type="text" defaultValue={value ?? ""} />
      <button className="ghost-button" type="submit" title="บันทึก" disabled={pending}>
        <Save size={16} />
      </button>
      {state?.ok ? (
        <span className="saved-status">
          <Check size={14} />
          บันทึกแล้ว
        </span>
      ) : null}
      {state?.error ? <span className="danger">{state.error}</span> : null}
    </form>
  );
}
