import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { getCurrentUser } from "@/lib/auth";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function getVisibleProjects(user: CurrentUser) {
  if (user.role === Role.SUPER_ADMIN) {
    return db.project.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } });
  }

  if (!user.department?.projectId) return [];
  const project = await db.project.findFirst({ where: { id: user.department.projectId, active: true } });
  return project ? [project] : [];
}

export async function resolveProjectForUser(user: CurrentUser, requestedProjectId?: string) {
  const projects = await getVisibleProjects(user);
  if (!projects.length) return { project: null, projects };

  if (requestedProjectId) {
    const requested = projects.find((project) => project.id === requestedProjectId);
    if (requested) return { project: requested, projects };
  }

  return { project: projects[0], projects };
}
