import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@prisma/client";
import { db } from "@/lib/db";

const cookieName = "excel_admin_session";

function getSecret() {
  return process.env.SESSION_SECRET ?? "local-dev-secret-change-before-production";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

function encodeSession(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string };
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(cookieName)?.value);
  if (!session) return null;

  return db.user.findUnique({
    where: { id: session.userId },
    include: {
      department: {
        include: {
          permissions: true,
          project: true
        }
      }
    }
  });
}

export async function requireApprovedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== UserStatus.APPROVED) redirect("/pending");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireApprovedUser();
  if (user.role !== Role.SUPER_ADMIN) redirect("/dashboard");
  return user;
}

export function userCanEditColumn(user: Awaited<ReturnType<typeof getCurrentUser>>, columnKey: string) {
  if (!user || user.status !== UserStatus.APPROVED) return false;
  if (user.role === Role.SUPER_ADMIN) return true;
  return Boolean(user.department?.permissions.some((permission) => permission.columnKey === columnKey && permission.canEdit));
}
