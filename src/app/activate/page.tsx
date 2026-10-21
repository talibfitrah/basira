import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ActivateApp from "@/components/ActivateApp";

export const metadata = { title: "الترخيص" };

export default async function Page() {
  if (!(await currentUser())) redirect("/login");
  return <Suspense><AppShell><ActivateApp /></AppShell></Suspense>;
}
