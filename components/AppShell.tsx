import Link from "next/link";
import { LogOut, Shield, Table2 } from "lucide-react";
import { Role } from "@prisma/client";
import { logoutAction } from "@/app/auth/actions";
import type { getCurrentUser } from "@/lib/auth";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">XL</span>
          <span>ระบบกรอกข้อมูลตามฝ่าย</span>
        </Link>
        <nav className="nav">
          <Link href="/dashboard">
            <Table2 size={16} />
            ข้อมูล
          </Link>
          {user.role === Role.SUPER_ADMIN ? (
            <Link href="/admin">
              <Shield size={16} />
              ผู้ดูแลระบบ
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button type="submit">
              <LogOut size={16} />
              ออกจากระบบ
            </button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
