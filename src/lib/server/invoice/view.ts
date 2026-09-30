/**
 * Instantané d'affichage d'une facture, partagé par l'aperçu HTML, le PDF
 * et l'e-mail. Les totaux figés au paiement (`Transaction.taxRate`, posé par
 * le webhook avec le taux réellement en vigueur à ce moment-là via
 * `$lib/server/vat.ts`) priment toujours ; à défaut d'un instantané (données
 * anciennes/incomplètes), ce module recalcule avec le taux de repli de
 * `snapshotInvoiceTotals` — fonction pure synchrone, ne relit jamais le
 * taux courant en base ici.
 *
 * COMMERCE-PLUGIN
 */
import type { InvoiceCompany, InvoiceLine, InvoiceView } from '$lib/invoice/types';
import { snapshotInvoiceTotals } from './totals';

export type { InvoiceLine, InvoiceView };

export type InvoiceSource = {
	id: string;
	createdAt: Date;
	amount: number;
	currency: string;
	shippingCost: number;
	invoiceNumber?: string | null;
	subtotalHt?: number | null;
	taxRate?: number | null;
	taxAmount?: number | null;
	discountAmount?: number | null;
	promoCode?: string | null;
	customer_details_name?: string | null;
	customer_details_email?: string | null;
	billing_phone?: string | null;
	billing_street_number?: string | null;
	billing_street?: string | null;
	billing_zip?: string | null;
	billing_city?: string | null;
	billing_state?: string | null;
	billing_state_code?: string | null;
	billing_country?: string | null;
	// Adresse d'expédition (shipping) : utilisée par le bordereau (`bordereau.ts`),
	// pas par la facture (qui affiche l'adresse de facturation ci-dessus).
	address_street_number?: string | null;
	address_street?: string | null;
	address_zip?: string | null;
	address_city?: string | null;
	address_state?: string | null;
	address_country?: string | null;
	products?: unknown;
};

type RawProduct = {
	name?: unknown;
	price?: unknown;
	quantity?: unknown;
	customizations?: unknown;
};

export function readCustomizations(
	raw: unknown
): Array<{ image: string; userMessage: string }> | undefined {
	if (!Array.isArray(raw) || raw.length === 0) return undefined;
	const entries = raw
		.map((entry) => {
			const c = (entry ?? {}) as { image?: unknown; userMessage?: unknown };
			const image = typeof c.image === 'string' ? c.image : '';
			const userMessage = typeof c.userMessage === 'string' ? c.userMessage : '';
			return image ? { image, userMessage } : null;
		})
		.filter((entry): entry is { image: string; userMessage: string } => entry !== null);
	return entries.length > 0 ? entries : undefined;
}

function asNumber(value: unknown, fallback = 0): number {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function readLines(raw: unknown): InvoiceLine[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((entry) => {
		const product = (entry ?? {}) as RawProduct;
		const name = typeof product.name === 'string' && product.name.trim() ? product.name : 'Article';
		const quantity = Math.max(1, Math.round(asNumber(product.quantity, 1)));
		const unitPrice = asNumber(product.price, 0);
		return {
			name,
			quantity,
			unitPrice,
			lineTotal: unitPrice * quantity,
			customizations: readCustomizations(product.customizations)
		};
	});
}

export function buildInvoiceView(source: InvoiceSource, company: InvoiceCompany): InvoiceView {
	const lines = readLines(source.products);
	const computed = snapshotInvoiceTotals({
		lines: lines.map((line) => ({ price: line.unitPrice, quantity: line.quantity })),
		shippingCost: asNumber(source.shippingCost, 0),
		discountAmount: asNumber(source.discountAmount, 0),
		paidTotal: asNumber(source.amount, 0)
	});

	const hasSnapshot = asNumber(source.subtotalHt, 0) > 0;
	const shippingCost = hasSnapshot ? asNumber(source.shippingCost, 0) : computed.shippingCost;
	const discountAmount = hasSnapshot ? asNumber(source.discountAmount, 0) : computed.discountAmount;
	const subtotalHt = hasSnapshot ? asNumber(source.subtotalHt, 0) : computed.subtotalHt;
	const taxRate = hasSnapshot ? asNumber(source.taxRate, computed.taxRate) : computed.taxRate;
	const taxAmount = hasSnapshot ? asNumber(source.taxAmount, 0) : computed.taxAmount;
	const totalTtc = asNumber(source.amount, computed.totalTtc);
	const issued = source.createdAt instanceof Date ? source.createdAt : new Date(source.createdAt);
	const number = source.invoiceNumber?.trim() || source.id;

	const street = [source.billing_street_number, source.billing_street]
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const zipCity = [source.billing_zip, source.billing_city]
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const region = [
		source.billing_state,
		source.billing_state_code ? `(${source.billing_state_code})` : ''
	]
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const country = source.billing_country?.trim() ?? '';

	return {
		id: source.id,
		number,
		issuedAt: issued.toISOString(),
		customerName: source.customer_details_name?.trim() || 'N/A',
		customerEmail: source.customer_details_email?.trim() || 'N/A',
		customerPhone: source.billing_phone?.trim() || 'N/A',
		addressLines: [street, zipCity, region, country].filter((line) => line.length > 0),
		lines,
		shippingCost,
		discountAmount,
		promoCode: source.promoCode?.trim() || '',
		subtotalHt,
		taxRate,
		taxAmount,
		totalTtc,
		currency: (source.currency || 'eur').toUpperCase(),
		filename: `Facture_${number}.pdf`,
		company
	};
}
