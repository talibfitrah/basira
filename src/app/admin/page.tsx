import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AdminApp from "@/components/AdminApp";

export const metadata = { title: "لوحة الإدارة" };

export default async function Page() {
  const u = await currentUser();
  if (!u) redirect("/login?next=/admin");
  if (u.role !== "admin") redirect("/chat");
  return <Suspense><AppShell><AdminApp /></AppShell></Suspense>;
}
