import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import LibraryApp from "@/components/LibraryApp";

export const metadata = { title: "المكتبة الشرعية" };

export default async function Page() {
  if (!(await currentUser())) redirect("/login?next=/library");
  return <Suspense><AppShell><LibraryApp /></AppShell></Suspense>;
}
