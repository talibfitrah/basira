import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AccountApp from "@/components/AccountApp";

export const metadata = { title: "حسابي" };

export default async function Page() {
  if (!(await currentUser())) redirect("/login?next=/account");
  return <Suspense><AppShell><AccountApp /></AppShell></Suspense>;
}
