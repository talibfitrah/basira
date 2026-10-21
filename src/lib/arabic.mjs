// تطبيع النص العربي للبحث — مشترك بين الخادم وسكربت بناء المكتبة.

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** @param {string} s */
export function normalizeArabic(s) {
  return (s || "")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** يزيل وسوم HTML من نصوص الشاملة مع الإبقاء على الأسطر. @param {string} s */
export function stripHtml(s) {
  return (s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^[ .\-_ـ*]{8,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const VARIANTS = { "ا": "[اأإآٱ]", "ي": "[يى]", "ه": "[هة]", "و": "[وؤ]" };
/**
 * تعبير نمطي يطابق الكلمة المطبَّعة في النص الأصلي المشكول.
 * @param {string} word
 */
export function arabicWordRegex(word) {
  const letters = [...word].map((c) => VARIANTS[c] || c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(letters.join("[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]*"), "u");
}

const PREFIXES = ["وال", "فال", "بال", "كال", "لل", "ال"];

/**
 * يبني استعلام FTS5 من كلام المستخدم: كل كلمة تطابق صورتها وصورتها بلا «ال».
 * @param {string} q @param {"and"|"or"} op
 */
export function buildFtsQuery(q, op = "and") {
  const words = normalizeArabic(q).split(" ").filter((w) => w.length > 1).slice(0, 12);
  if (!words.length) return "";
  const parts = words.map((w) => {
    const forms = new Set([`"${w}"`]);
    for (const p of PREFIXES) {
      if (w.startsWith(p) && w.length - p.length >= 2) {
        forms.add(`"${w.slice(p.length)}"`);
        break;
      }
    }
    return forms.size > 1 ? `(${[...forms].join(" OR ")})` : [...forms][0];
  });
  return parts.join(op === "and" ? " AND " : " OR ");
}

/**
 * صورة الفهرسة: الكلمة المطبَّعة، وتليها صورتها مجرَّدة من السوابق الشائعة
 * (و/ف/ب/ك + ال)، فيُعثر على «والصلاة» بالبحث عن «الصلاة» أو «صلاة».
 * @param {string} s
 */
export function indexForm(s) {
  const out = [];
  for (const w of normalizeArabic(s).split(" ")) {
    if (!w) continue;
    out.push(w);
    for (const p of PREFIXES) {
      if (w.startsWith(p) && w.length - p.length >= 2) {
        const bare = w.slice(p.length);
        out.push(bare);
        if (p.length > 2) out.push("ال" + bare);
        break;
      }
    }
    if (/^[وف]/.test(w) && w.length > 3 && !w.startsWith("وال") && !w.startsWith("فال")) out.push(w.slice(1));
  }
  return out.join(" ");
}

// كلمات السؤال والصياغة التي لا تفيد في البحث عن النص نفسه
const STOP = new Set(("ما ماذا من في عن على الى الي إلى هل كيف لماذا متى اين أين اذكر اذكرلي اشرح بين بيّن وضح وضّح اعطني أعطني لي لنا مع او أو ثم هو هي هذا هذه ذلك تلك التي الذي الذين كان كانت " +
  "يكون عند قد لا لم لن ان أن إن كل بعض اي أي مصدره مصدرها مصادره مصدر مع_المصدر حديثا حديثًا صحيحا صحيحًا دليل دليلا الدليل الأدلة ادله ادلة ارجو أرجو من_فضلك فضلا السؤال سؤال جواب اجب أجب").split(" ").map((w) => normalizeArabic(w)));

/** كلمات البحث المفيدة من سؤال المستخدم. @param {string} q */
export function keywords(q) {
  return normalizeArabic(q).split(" ").filter((w) => w.length > 1 && !STOP.has(w)).slice(0, 10).join(" ");
}
