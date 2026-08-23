/**
 * Instantané d'affichage d'une facture, partagé par l'aperçu HTML, le PDF
 * et l'e-mail. Les totaux restent ceux du PDF historique (TVA 20 % extraite
 * du TTC) — l'alignement avec le panier 5,5 % est un lot séparé.
 *
 * COMMERCE-PLUGIN
 */
import type { InvoiceLine, InvoiceView } from '$lib/invoice/types';
import { getInvoiceCompany } from './company';

export type { InvoiceLine, InvoiceView };

export type InvoiceSource = {
	id: string;
	createdAt: Date;
	amount: number;
	currency: string;
	shippingCost: number;
	customer_details_name?: string | null;
	customer_details_email?: string | null;
	address_phone?: string | null;
	address_street_number?: string | null;
	address_street?: string | null;
	address_zip?: string | null;
	address_city?: string | null;
	address_state?: string | null;
	address_state_code?: string | null;
	address_country?: string | null;
	products?: unknown;
};

type RawProduct = {
	name?: unknown;
	price?: unknown;
	quantity?: unknown;
};

const TAX_RATE = 20;

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
			lineTotal: unitPrice * quantity
		};
	});
}

export function buildInvoiceView(source: InvoiceSource): InvoiceView {
	const shippingCost = asNumber(source.shippingCost, 0);
	const totalTtc = asNumber(source.amount, 0);
	const goodsTtc = Math.max(0, totalTtc - shippingCost);
	const subtotalHt = goodsTtc / (1 + TAX_RATE / 100);
	const taxAmount = goodsTtc - subtotalHt;
	const issued = source.createdAt instanceof Date ? source.createdAt : new Date(source.createdAt);

	const street = [source.address_street_number, source.address_street]
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const zipCity = [source.address_zip, source.address_city]
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const region = [source.address_state, source.address_state_code ? `(${source.address_state_code})` : '']
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const country = source.address_country?.trim() ?? '';

	return {
		id: source.id,
		issuedAt: issued.toISOString(),
		customerName: source.customer_details_name?.trim() || 'N/A',
		customerEmail: source.customer_details_email?.trim() || 'N/A',
		customerPhone: source.address_phone?.trim() || 'N/A',
		addressLines: [street, zipCity, region, country].filter((line) => line.length > 0),
		lines: readLines(source.products),
		shippingCost,
		subtotalHt,
		taxRate: TAX_RATE,
		taxAmount,
		totalTtc,
		currency: (source.currency || 'eur').toUpperCase(),
		filename: `Facture_${source.id}.pdf`,
		company: getInvoiceCompany()
	};
}
