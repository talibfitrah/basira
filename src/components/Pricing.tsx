import Link from "next/link";
import { listPlans } from "@/lib/models";
import { numS } from "@/lib/format";
import { IconCheck } from "./Icons";

export default function Pricing({ loggedIn }: { loggedIn: boolean }) {
  const plans = listPlans();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((p) => {
        const features: string[] = JSON.parse(p.features);
        const featured = p.id === "pro";
        return (
          <div key={p.id} className={`card p-6 flex flex-col ${featured ? "ring-2 ring-[var(--color-brand)]" : ""}`}>
            {featured && <span className="chip self-start mb-3" data-on="true">الأكثر اختيارًا</span>}
            <h3 className="text-lg font-bold">{p.name}</h3>
            <p className="text-sm text-[var(--color-muted)] mt-1 min-h-10">{p.description}</p>
            <div className="mt-4 mb-1">
              <span className="text-3xl font-bold">{p.price_eur > 0 ? `€${numS(p.price_eur, 2)}` : "مجانًا"}</span>
              {p.price_eur > 0 && <span className="text-sm text-[var(--color-muted)]"> / شهريًّا</span>}
            </div>
            <p className="text-sm text-[var(--color-muted)] mb-4">{numS(p.monthly_credits)} نقطة استعمال كل شهر</p>
            <ul className="space-y-2 text-sm flex-1">
              {features.map((f) => (
                <li key={f} className="flex gap-2 items-start"><IconCheck className="w-4 h-4 mt-1 text-[var(--color-brand)] shrink-0" />{f}</li>
              ))}
            </ul>
            <Link href={loggedIn ? (p.price_eur > 0 ? `/account?upgrade=${p.id}` : "/chat") : "/register"}
              className={`btn mt-6 ${featured ? "btn-primary" : "btn-ghost"}`}>
              {p.price_eur > 0 ? "اشترك الآن" : "ابدأ مجانًا"}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
