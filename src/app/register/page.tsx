import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { branding } from "@/lib/config";
import AuthForm from "@/components/AuthForm";
import { Logo } from "@/components/Icons";

export const metadata = { title: "حساب جديد" };

export default async function Page() {
  if (await currentUser()) redirect("/chat");
  const b = branding();
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 gap-6">
      <Link href="/" className="flex items-center gap-2 font-bold text-xl"><Logo />{b.appName}</Link>
      <AuthForm mode="register" appName={b.appName} />
    </div>
  );
}
