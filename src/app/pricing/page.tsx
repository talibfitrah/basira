import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { branding } from "@/lib/config";
import Pricing from "@/components/Pricing";
import { Logo } from "@/components/Icons";

export const metadata = { title: "الباقات" };

export default async function PricingPage() {
  const user = await currentUser();
  const b = branding();
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between mb-10">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg"><Logo />{b.appName}</Link>
        <Link href={user ? "/chat" : "/login"} className="btn btn-ghost">{user ? "إلى المنصة" : "دخول"}</Link>
      </header>
      <h1 className="font-serif text-4xl font-bold text-center">اختر باقتك</h1>
      <p className="text-center text-[var(--color-muted)] mt-3 mb-10">تُجدَّد النقاط كل شهر، ويمكنك الترقية أو الإلغاء متى شئت. الدفع آمن عبر Stripe (بطاقات، iDEAL، وغيرها).</p>
      <Pricing loggedIn={!!user} />
      <div className="card p-6 mt-10 text-sm leading-loose text-[var(--color-muted)]">
        <b className="text-[var(--color-ink)]">كيف تُحسب النقاط؟</b> كل رسالة تستهلك نقاطًا بحسب النموذج المستعمل وطول النص؛ النماذج السريعة أرخص بكثير من الأقوى.
        الصورة الواحدة والقراءة الصوتية لها كلفة ثابتة تظهر قبل التنفيذ. يمكنك متابعة استهلاكك من صفحة الحساب.
      </div>
    </div>
  );
}
