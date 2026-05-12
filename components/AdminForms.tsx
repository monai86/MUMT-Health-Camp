"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createDepartmentAction, createProjectAction } from "@/app/admin/actions";

export function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, null);

  return (
    <form action={formAction} className="actions">
      <input name="name" placeholder="เพิ่ม Project ใหม่" required />
      <button className="button" type="submit" disabled={pending}>
        <Plus size={16} />
        เพิ่ม Project
      </button>
      {state?.error ? <span className="danger">{state.error}</span> : null}
      {state?.ok ? <span className="saved-status">เพิ่ม Project แล้ว</span> : null}
    </form>
  );
}

export function CreateDepartmentForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createDepartmentAction, null);

  return (
    <form action={formAction} className="actions">
      <select name="projectId" required defaultValue="">
        <option value="" disabled>
          เลือก Project
        </option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <input name="name" placeholder="เพิ่มตำแหน่งใหม่" required />
      <button className="button" type="submit" disabled={pending}>
        <Plus size={16} />
        เพิ่มตำแหน่ง
      </button>
      {state?.error ? <span className="danger">{state.error}</span> : null}
    </form>
  );
}
