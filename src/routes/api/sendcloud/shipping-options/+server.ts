// Options de livraison Sendcloud
// Purpose: Simple, safe endpoint to fetch normalized shipping options from Sendcloud V3.
//
// Key features:
// - Strict Zod validation (accepts prefer_service_point, max_per_type, allowed_carriers, include_weekend).
// - Minimal functionalities (b2c + tracked) + lead time cap; fallback without filters if empty.
// - Map v3 options -> compact DTO ({ id, carrierCode, productName, type, price, eta }).
// - Filter carriers, drop age_check and zero-price quotes.
// - Dedupe Chronopost: collapse 10/13/18 home into one family; collapse SP variants (shop2shop/service_point_abroad).
// - Drop Saturday / noisy flags by default (configurable).
// - Return exactly up to 5 service_point and 5 home_delivery options (order controlled by prefer_service_point).
// - Meta includes curated summaries (human-friendly) and dedupe stats.
// - Timeout and compact structured logs (no raw payload exposure).

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Constante pour activer/désactiver les logs de debug
const DEBUG = process.env.SENDCLOUD_DEBUG === 'true' || false;

// Fonction helper pour les logs conditionnels
function debugLog(...args: any[]) {
	if (DEBUG) {
		console.log(...args);
	}
}

/** === Validation ========================================================= */
const InputZ = z
  .object({
    from_country_code: z.string().length(2, 'from_country_code must be 2-letter ISO'),
    to_country_code: z.string().length(2, 'to_country_code must be 2-letter ISO'),
    from_postal_code: z.string().min(2),
    to_postal_code: z.string().min(2),
	weight: z.object({
      value: z.number().positive(),
      unit: z.enum(['kilogram', 'gram'])
    }),

    // UX knobs
    prefer_service_point: z.boolean().optional().default(false),
    include_weekend: z.boolean().optional().default(false),

    // Exactly "N per last_mile type"
    max_per_type: z.number().int().min(1).max(10).optional().default(5),

    // Backward-compat: ignore if set, kept only to not break callers
    max_options: z.number().int().min(1).max(20).optional().default(10),

    // Carriers whitelist (default: FR market)
    allowed_carriers: z.array(z.string()).optional()
  })
  .strict();

/** === Generic helpers ==================================================== */
function toKg(value: number, unit: 'kilogram' | 'gram'): number {
  const kg = unit === 'kilogram' ? value : value / 1000;
  return Math.round(kg * 1000) / 1000;
}

function toBase64(s: string): string {
  // @ts-ignore btoa may exist in some runtimes
  if (typeof btoa === 'function') return btoa(s);
  return Buffer.from(s).toString('base64');
}

function buildAuthHeader(): string {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY;
  const priv = process.env.SENDCLOUD_SECRET_KEY;
  if (!pub || !priv) throw error(500, 'Sendcloud credentials are not configured');
  return `Basic ${toBase64(`${pub}:${priv}`)}`;
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  ms = 10_000
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Domestic vs international lead-time cap (hours). */
function leadTimeCapHours(from: string, to: string) {
  return from.toUpperCase() === to.toUpperCase() ? 72 : 120;
}

/** Minimal functionalities for a broad match (avoid over-filtering). */
function buildMinimalFunctionalities() {
  return {
    b2c: true,
    tracked: true
  } as const;
}

/** Build the base payload (v3 keys, never raw forward to clients). */
function buildBasePayload(input: z.infer<typeof InputZ>) {
  const weightKg = toKg(input.weight.value, input.weight.unit);
  return {
    from_country_code: input.from_country_code,
    to_country_code: input.to_country_code,
    from_postal_code: input.from_postal_code,
    to_postal_code: input.to_postal_code,
    weight: { value: String(weightKg), unit: 'kg' }
  };
}

/** === DTO mapping (for the UI) ========================================== */
type QuoteDTO = {
  id: string;
  carrierCode: string;
  productName: string;
  type: 'service_point' | 'home_delivery';
  price: number;
  eta?: string;
};

function etaFromLeadTimeHours(lead?: number): string | undefined {
  if (!lead || !Number.isFinite(lead)) return undefined;
  const d = new Date();
  d.setHours(d.getHours() + lead);
  return d.toISOString();
}

function pickCheapestQuote(quotes: any[]): { price: number; lead_time?: number } | null {
  let best: { price: number; lead_time?: number } | null = null;
  for (const q of quotes ?? []) {
    const v = Number(q?.price?.total?.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (!best || v < best.price) best = { price: v, lead_time: Number(q?.lead_time) };
  }
  return best;
}

/** Map Sendcloud v3 options to a compact, stable DTO for the frontend. */
function mapQuotesV3(resp: any): QuoteDTO[] {
  const arr: any[] = Array.isArray(resp?.data) ? resp.data : [];
  const out: QuoteDTO[] = [];

  for (const opt of arr) {
    const id = String(opt?.code ?? '').trim();
    if (!id) continue;

    // Exclude age-check variants for a simple B2C flow
    const ageCheck = opt?.functionalities?.age_check ?? null;
    if (ageCheck !== null && ageCheck !== undefined) continue;

    const carrierCode = String(opt?.carrier?.code ?? '').toLowerCase().trim();
    const productName =
      String(opt?.name ?? opt?.product?.name ?? opt?.product?.code ?? 'Unknown').trim();

    const lastMile = String(opt?.functionalities?.last_mile ?? '').toLowerCase();
    const type: 'service_point' | 'home_delivery' =
      lastMile === 'service_point' ? 'service_point' : 'home_delivery';

    const best = pickCheapestQuote(opt?.quotes ?? []);
    if (!best) continue;

    out.push({
      id,
      carrierCode,
      productName,
      type,
      price: best.price,
      eta: etaFromLeadTimeHours(best.lead_time)
    });
  }

  // Stable ordering by price then carrier
  out.sort((a, b) => (a.price - b.price) || a.carrierCode.localeCompare(b.carrierCode));
  return out;
}

/** === Dedupe & noise filters ============================================ */
/** Drop weekend variants by default (noise for most flows). */
function dropWeekendVariants(items: QuoteDTO[], includeWeekend: boolean): QuoteDTO[] {
  if (includeWeekend) return items;
  const weekendRx = /\/saturday\b/i;
  return items.filter((it) => !weekendRx.test(it.id));
}

/** Drop niche flags that often create duplicates (address-only, agecheck in code). */
function dropNoisyFlags(items: QuoteDTO[]): QuoteDTO[] {
  const noisy = [/\bhome[_ ]?adress?_only\b/i, /\bagecheck\b/i];
  return items.filter((it) => !noisy.some((rx) => rx.test(it.id)));
}

/** Build a "family" key to collapse equivalent Chronopost products. */
function familyKey(d: QuoteDTO): string {
  const id = d.id.toLowerCase();
  if (d.carrierCode === 'chronopost') {
    // Collapse timed home deliveries (10/13/18) into one family
    if (d.type === 'home_delivery' && /^chronopost:(10|13|18)\b/.test(id)) {
      return 'chronopost|timed|home';
    }
    // Collapse SP variants (service_point, service_point_abroad, shop2shop)
    if (d.type === 'service_point' && /^chronopost:(service_point|shop2shop|service_point_abroad)\b/.test(id)) {
      return 'chronopost|relay|sp';
    }
  }
  // Generic fallback: (carrier | normalized product | type)
  return `${d.carrierCode}|${d.productName.toLowerCase()}|${d.type}`;
}

/** Keep only the cheapest option per family. */
function keepCheapestByFamily(items: QuoteDTO[]): QuoteDTO[] {
  const best = new Map<string, QuoteDTO>();
  for (const it of items) {
    const key = familyKey(it);
    const prev = best.get(key);
    if (!prev || it.price < prev.price) best.set(key, it);
  }
  return Array.from(best.values()).sort((a, b) => a.price - b.price);
}

/** === Important summaries (human-meaningful) ============================ */
/** Compact important information, not the same as frontend DTO. */
type ImportantInfo = {
  id: string;
  carrier: string;
  product: string;
  type: 'home_delivery' | 'service_point';
  signature: boolean;
  tracked: boolean;
  serviceArea?: 'domestic' | 'domestic_remote' | 'international';
  weightMinKg?: number;
  weightMaxKg?: number;
  maxDims?: { length: number; width: number; height: number; unit: string };
  price?: { value: number; currency: string };
  leadTimeHours?: number;
  etaISO?: string;
  relayRequired?: boolean;
};

function num(x: unknown): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function cheapestQuoteFull(quotes: any[] | undefined) {
  let best: { value: number; currency: string; lead?: number } | undefined;
  for (const q of quotes ?? []) {
    const v = num(q?.price?.total?.value);
    const c = String(q?.price?.total?.currency ?? 'EUR');
    if (v == null || v <= 0) continue;
    if (!best || v < best.value) best = { value: v, currency: c, lead: num(q?.lead_time) };
  }
  return best;
}

function extractImportantInfo(opt: any): ImportantInfo | null {
  const ageCheck = opt?.functionalities?.age_check ?? null;
  if (ageCheck !== null && ageCheck !== undefined) return null; // drop age-check variants

  const id = String(opt?.code ?? '').trim();
  if (!id) return null;

  const carrier = String(opt?.carrier?.name ?? opt?.carrier?.code ?? '').trim();
  const product = String(opt?.name ?? opt?.product?.name ?? opt?.product?.code ?? 'Unknown').trim();

  const lm = String(opt?.functionalities?.last_mile ?? '').toLowerCase();
  const type: 'home_delivery' | 'service_point' = lm === 'service_point' ? 'service_point' : 'home_delivery';

  const signature = Boolean(opt?.functionalities?.signature);
  const tracked = Boolean(opt?.functionalities?.tracked);
  const serviceArea = opt?.functionalities?.service_area as ImportantInfo['serviceArea'];

  const weightMinKg = num(opt?.weight?.min?.value);
  const weightMaxKg = num(opt?.weight?.max?.value);

  const maxDims = opt?.max_dimensions
    ? {
        length: Number(opt.max_dimensions.length ?? 0),
        width: Number(opt.max_dimensions.width ?? 0),
        height: Number(opt.max_dimensions.height ?? 0),
        unit: String(opt.max_dimensions.unit ?? 'cm')
      }
    : undefined;

  const best = cheapestQuoteFull(opt?.quotes);
  const leadTimeHours = best?.lead;
  const etaISO = leadTimeHours ? etaFromLeadTimeHours(leadTimeHours) : undefined;

  const relayRequired = Boolean(opt?.requirements?.is_service_point_required);

  return {
    id,
    carrier,
    product,
    type,
    signature,
    tracked,
    serviceArea,
    weightMinKg: weightMinKg != null ? Number(weightMinKg) : undefined,
    weightMaxKg: weightMaxKg != null ? Number(weightMaxKg) : undefined,
    maxDims,
    price: best ? { value: best.value, currency: best.currency } : undefined,
    leadTimeHours,
    etaISO,
    relayRequired
  };
}

function summarizeOptions(list: any[]): ImportantInfo[] {
  const out: ImportantInfo[] = [];
  for (const opt of list ?? []) {
    const s = extractImportantInfo(opt);
    if (s) out.push(s);
  }
  // Order by price if present, otherwise by carrier
  out.sort((a, b) => {
    if (a.price && b.price) return a.price.value - b.price.value;
    if (a.price && !b.price) return -1;
    if (!a.price && b.price) return 1;
    return a.carrier.localeCompare(b.carrier);
  });
  return out;
}

/** Allowed carriers default (FR-centric). */
const DEFAULT_ALLOWED_CARRIERS = ['colissimo', 'chronopost', 'mondial_relay', 'ups'] as const;

/** === Handler ============================================================ */
export const POST: RequestHandler = async ({ request, fetch }) => {
  // 1) Validate body (strict)
  const bodyJson = await request.json().catch(() => {
    throw error(400, 'Invalid JSON body');
  });
  const input = InputZ.parse(bodyJson);

  // 2) Build payload (broad first try)
  const base = buildBasePayload(input);
  const payloadTry1: Record<string, unknown> = {
    ...base,
    functionalities: buildMinimalFunctionalities(), // only b2c + tracked
    lead_time: { lte: leadTimeCapHours(input.from_country_code, input.to_country_code) } // SLA cap
  };

  const url = 'https://panel.sendcloud.sc/api/v3/fetch-shipping-options';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: buildAuthHeader()
  };

  // 3) First call
  let res = await fetchWithTimeout(fetch, url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payloadTry1)
  });
  if (res.status === 429) throw error(429, 'Rate limited by Sendcloud');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw error(res.status, text || 'Unexpected Sendcloud error');
  }
  let raw = await res.json().catch(() => ({} as any));
  let all: any[] = Array.isArray(raw?.data) ? raw.data : [];

  	debugLog(
		JSON.stringify({
			ts: new Date().toISOString(),
			level: 'info',
			event: 'sendcloud_v3_fetch_try1',
			status: res.status,
			received: all.length
		})
	);

  // 4) Fallback if empty: remove lead_time & functionalities (max breadth)
  let usedFallback = false;
  if (!all.length) {
    usedFallback = true;
    const payloadTry2 = { ...base }; // no functionalities, no lead_time
    res = await fetchWithTimeout(fetch, url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payloadTry2)
    });
    if (res.status === 429) throw error(429, 'Rate limited by Sendcloud');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw error(res.status, text || 'Unexpected Sendcloud error (fallback)');
    }
    raw = await res.json().catch(() => ({} as any));
    all = Array.isArray(raw?.data) ? raw.data : [];

    	debugLog(
		JSON.stringify({
			ts: new Date().toISOString(),
			level: 'info',
			event: 'sendcloud_v3_fetch_try2',
			status: res.status,
			received: all.length
		})
	);
  }

  // 5) Filter carriers (whitelist) then summaries for meta/debug
  const allowedCarriers = (input.allowed_carriers?.length
    ? input.allowed_carriers.map((c) => c.toLowerCase())
    : Array.from(DEFAULT_ALLOWED_CARRIERS));

  const filteredRaw = all.filter((o: any) => {
    const carrierCode = String(o?.carrier?.code ?? '').toLowerCase();
    return allowedCarriers.includes(carrierCode);
  });

  const summaries = summarizeOptions(filteredRaw);

  // 6) Map to DTO, drop noise, dedupe families
  let dtos = mapQuotesV3({ data: filteredRaw });

  const beforeNoise = dtos.length;
  dtos = dropWeekendVariants(dtos, input.include_weekend);
  dtos = dropNoisyFlags(dtos);
  const afterNoise = dtos.length;

  const beforeDedupe = dtos.length;
  dtos = keepCheapestByFamily(dtos);
  const afterDedupe = dtos.length;

  // 7) Split by last_mile and keep up to max_per_type each
  const spAll = dtos.filter((d) => d.type === 'service_point').sort((a, b) => a.price - b.price);
  const homeAll = dtos.filter((d) => d.type === 'home_delivery').sort((a, b) => a.price - b.price);

  const sp = spAll.slice(0, input.max_per_type);     // up to 5 by default
  const home = homeAll.slice(0, input.max_per_type); // up to 5 by default

  // Ordering preference for the final merged list
  const merged = input.prefer_service_point ? [...sp, ...home] : [...home, ...sp];

  // 8) Response
  return json({
    data: merged,                 // flat list for the UI (merged groups)
    meta: {
      // expose groups for convenience if UI wants to render sections
      groups: {
        service_point: sp,
        home_delivery: home
      },
      summaries,
      dedupe: {
        before_noise: beforeNoise,
        after_noise: afterNoise,
        before_dedupe: beforeDedupe,
        after_dedupe: afterDedupe
      }
    },
    filtering: {
      total_received: all.length,
      filtered_count: filteredRaw.length,
      allowed_carriers: allowedCarriers,
      prefer_service_point: input.prefer_service_point,
      include_weekend: input.include_weekend,
      max_per_type: input.max_per_type,
      used_fallback: usedFallback
    }
  });
};
