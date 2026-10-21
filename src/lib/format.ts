import { branding } from "./config";

export function numS(n: number, digits = 0) {
  return new Intl.NumberFormat(branding().indicDigits ? "ar-EG-u-nu-arab" : "ar-u-nu-latn", { maximumFractionDigits: digits }).format(n);
}
