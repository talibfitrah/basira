import { requireAdmin, errorResponse, HttpError } from "@/lib/auth";
import { setSetting, getSetting } from "@/lib/db";
import { PROVIDERS, providerKey, setProviderKey, maskKey, branding, encrypt, stripeSecret, stripeWebhookSecret, publicUrl, independentMode, type Provider } from "@/lib/config";
import { ollamaUrl, searxUrl, whisperUrl } from "@/lib/local";
import { DEFAULT_GENERAL_PROMPT, DEFAULT_SCHOLAR_PROMPT } from "@/lib/prompts";

export async function GET() {
  try {
    await requireAdmin();
    return Response.json({
      branding: branding(),
      providers: PROVIDERS.map((p) => ({ ...p, configured: !!providerKey(p.id), masked: maskKey(providerKey(p.id)), fromEnv: !getSetting(`key_${p.id}`) && !!process.env[p.env] })),
      stripe: { secret: maskKey(stripeSecret()), webhook: maskKey(stripeWebhookSecret()), webhookUrl: `${publicUrl()}/api/billing/webhook` },
      prompts: {
        general: getSetting("prompt_general", DEFAULT_GENERAL_PROMPT),
        scholar: getSetting("prompt_scholar", DEFAULT_SCHOLAR_PROMPT),
      },
      publicUrl: publicUrl(),
      independent: independentMode(),
      local: { ollama: ollamaUrl(), searx: searxUrl(), whisper: whisperUrl() },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const b = await req.json();
    if (b.branding) {
      const br = b.branding;
      if (typeof br.appName === "string") setSetting("app_name", br.appName.trim().slice(0, 60) || "بَصِيرة");
      if (typeof br.tagline === "string") setSetting("tagline", br.tagline.trim().slice(0, 300));
      if (typeof br.supportEmail === "string") setSetting("support_email", br.supportEmail.trim().slice(0, 120));
      if (typeof br.indicDigits === "boolean") setSetting("indic_digits", br.indicDigits ? "1" : "0");
      if (typeof br.allowRegistration === "boolean") setSetting("allow_registration", br.allowRegistration ? "1" : "0");
    }
    if (typeof b.independent === "boolean") setSetting("independent", b.independent ? "1" : "0");
    if (b.local) {
      for (const [k, key] of [["ollama", "local_url"], ["searx", "searx_url"], ["whisper", "whisper_url"]] as const) {
        const v = b.local[k];
        if (typeof v === "string") {
          if (v && !/^https?:\/\/[^\s]+$/.test(v.trim())) throw new HttpError(400, "رابط غير صالح");
          setSetting(key, v.trim());
        }
      }
    }
    if (b.keys) {
      for (const [p, k] of Object.entries(b.keys as Record<string, string>)) {
        if (!PROVIDERS.find((x) => x.id === p)) throw new HttpError(400, "مزوّد غير معروف");
        if (typeof k === "string") setProviderKey(p as Provider, k.trim());
      }
    }
    if (b.stripe) {
      if (typeof b.stripe.secret === "string") setSetting("stripe_secret", b.stripe.secret.trim() ? encrypt(b.stripe.secret.trim()) : "");
      if (typeof b.stripe.webhook === "string") setSetting("stripe_webhook_secret", b.stripe.webhook.trim() ? encrypt(b.stripe.webhook.trim()) : "");
    }
    if (b.prompts) {
      if (typeof b.prompts.general === "string") setSetting("prompt_general", b.prompts.general.slice(0, 20000));
      if (typeof b.prompts.scholar === "string") setSetting("prompt_scholar", b.prompts.scholar.slice(0, 20000));
      if (b.prompts.reset === "general") setSetting("prompt_general", DEFAULT_GENERAL_PROMPT);
      if (b.prompts.reset === "scholar") setSetting("prompt_scholar", DEFAULT_SCHOLAR_PROMPT);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
