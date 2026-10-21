import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ChatApp from "@/components/ChatApp";

export const metadata = { title: "المحادثة" };

export default async function Page() {
  if (!(await currentUser())) redirect("/login?next=/chat");
  return <Suspense><ChatApp /></Suspense>;
}
