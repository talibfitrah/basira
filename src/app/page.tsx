import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { branding, independentMode } from "@/lib/config";
import { listModels } from "@/lib/models";
import Pricing from "@/components/Pricing";
import { numS } from "@/lib/format";
import { Logo, IconChat, IconBook, IconImage, IconMic, IconGlobe, IconCode, IconShield } from "@/components/Icons";

export default async function Home() {
  if (process.env.DESKTOP_MODE === "1") redirect("/chat");
  const user = await currentUser();
  const b = branding();
  const providers = [...new Set(listModels("chat").filter((m) => m.provider !== "demo").map((m) => m.label.split(" ")[0]))];
  const indep = independentMode();
  const features = [
    indep
      ? { icon: IconChat, title: "ذكاء اصطناعي مستقل بالكامل", text: "نماذجنا تعمل على خوادمنا نحن، فلا تُرسَل محادثاتك وملفاتك إلى أي شركة خارجية." }
      : { icon: IconChat, title: "أقوى النماذج في مكان واحد", text: `${providers.join("، ")} وغيرها؛ اختر لكل مهمة النموذج الأنسب لها دون اشتراكات متفرقة.` },
    { icon: IconBook, title: "القسم الشرعي الموثَّق", text: "بحث في مكتبة شرعية منتقاة، ونقل للآيات من مصدر موثق، وعزو كل نقل إلى كتابه وصفحته." },
    ...(indep && !listModels("image").some((m) => m.provider === "local") ? [] : [{ icon: IconImage, title: "توليد الصور", text: "صور عالية الجودة من وصف نصي، بمقاسات متعددة، تُحفظ في معرضك." }]),
    { icon: IconMic, title: "الصوت", text: "تحدَّث بدل الكتابة، واستمع إلى الردود بقراءة عربية." },
    { icon: IconGlobe, title: "البحث في الويب", text: "إجابات محدَّثة من الإنترنت مع روابط المصادر." },
    { icon: IconCode, title: "الكتابة والبرمجة والتحليل", text: indep ? "كتابة الرسائل والمقالات والشيفرة، وتحليل النصوص والملفات النصية والجداول." : "كتابة الشيفرة وتشغيلها، وقراءة ملفات PDF والصور والجداول وتحليلها." },
  ];
  return (
    <div>
      <header className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg"><Logo />{b.appName}</Link>
        <nav className="flex items-center gap-2">
          <Link href="/pricing" className="btn hidden sm:inline-flex">الباقات</Link>
          {user ? (
            <Link href="/chat" className="btn btn-primary">ادخل إلى المنصة</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">دخول</Link>
              <Link href="/register" className="btn btn-primary">ابدأ مجانًا</Link>
            </>
          )}
        </nav>
      </header>

      <section className="max-w-4xl mx-auto px-4 pt-14 pb-16 text-center">
        <h1 className="font-serif text-4xl sm:text-6xl font-bold leading-tight">{b.appName}</h1>
        <p className="mt-5 text-lg sm:text-xl text-[var(--color-muted)] leading-relaxed">{b.tagline}</p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link href={user ? "/chat" : "/register"} className="btn btn-primary text-base px-6 py-3">جرّب الآن مجانًا</Link>
          <Link href="/pricing" className="btn btn-ghost text-base px-6 py-3">اطّلع على الباقات</Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-6">
            <f.icon className="w-7 h-7 text-[var(--color-brand)]" />
            <h3 className="font-bold mt-3 text-lg">{f.title}</h3>
            <p className="text-[var(--color-muted)] mt-2 leading-relaxed">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="card p-8 sm:p-10 bg-[var(--color-brand-soft)] border-[var(--color-brand)]/30 grid sm:grid-cols-[auto_1fr] gap-6 items-start">
          <IconShield className="w-12 h-12 text-[var(--color-brand)]" />
          <div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold">الأمانة العلمية أولًا</h2>
            <p className="mt-3 leading-loose">
              في القسم الشرعي لا يكتب المساعد آيةً إلا من مصدر موثق برقمها، ولا ينسب نقلًا إلى كتاب إلا بعد العثور عليه في المكتبة،
              مع رابط الصفحة للتحقق. وما لم يجده يصرّح بأنه لم يقف عليه. المنهج: الكتاب والسنة بفهم الصحابة، والحكم على الأحاديث
              باعتماد تخريجات الشيخ الألباني رحمه الله.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-20" id="pricing">
        <h2 className="font-serif text-3xl font-bold text-center mb-8">الباقات</h2>
        <Pricing loggedIn={!!user} />
      </section>

      <footer className="border-t border-[var(--color-line)] py-8 text-center text-sm text-[var(--color-muted)]">
        © {numS(new Date().getFullYear()).replace(/[٬,]/g, "")} {b.appName}{b.supportEmail ? ` · ${b.supportEmail}` : ""}
      </footer>
    </div>
  );
}
