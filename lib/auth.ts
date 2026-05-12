import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@prisma/client";
import { db } from "@/lib/db";

const cookieName = "excel_admin_session";

function getSecret() {
  return process.env.SESSION_SECRET ?? "local-dev-secret-change-before-production";
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

async function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function decodeSession(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if (!(await timingSafeEqual(await sign(payload), signature))) return null;

  try {
    const text = new TextDecoder().decode(fromBase64Url(payload));
    return JSON.parse(text) as { userId: string };
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ userId })));
  cookieStore.set(cookieName, `${payload}.${await sign(payload)}`, {
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
  const session = await decodeSession(cookieStore.get(cookieName)?.value);
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
