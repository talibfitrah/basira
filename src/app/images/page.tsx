import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ImagesApp from "@/components/ImagesApp";

export const metadata = { title: "الصور" };

export default async function Page() {
  if (!(await currentUser())) redirect("/login?next=/images");
  return <Suspense><AppShell><ImagesApp /></AppShell></Suspense>;
}
