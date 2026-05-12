import { redirect } from "next/navigation";
import { UserStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== UserStatus.APPROVED) redirect("/pending");
  redirect("/dashboard");
}
