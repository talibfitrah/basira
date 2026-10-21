import { HttpError } from "./auth";

type G = typeof globalThis & { __rl?: Map<string, number[]> };
const g = globalThis as G;

/** حدّ بسيط في الذاكرة: عدد الطلبات المسموح في نافذة زمنية. */
export function rateLimit(key: string, max: number, windowMs: number) {
  if (!g.__rl) g.__rl = new Map();
  const t = Date.now();
  const arr = (g.__rl.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) throw new HttpError(429, "طلبات كثيرة متتابعة، انتظر قليلًا ثم أعد المحاولة");
  arr.push(t);
  g.__rl.set(key, arr);
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
