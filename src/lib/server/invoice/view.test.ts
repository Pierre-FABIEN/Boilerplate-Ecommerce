import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber } from './number';
import { snapshotInvoiceTotals } from './totals';
import { buildInvoiceView } from './view';
import { renderInvoicePdf } from './pdf';

const source = {
	id: 'tx_test_1',
	invoiceNumber: 'FAC-2026-00001',
	createdAt: new Date('2026-08-23T10:00:00.000Z'),
	amount: 109.09,
	currency: 'eur',
	shippingCost: 3.34,
	subtotalHt: 100,
	taxRate: 5.5,
	taxAmount: 5.5,
	discountAmount: 0,
	customer_details_name: 'Pierre Test',
	customer_details_email: 'pierre@example.test',
	address_phone: '0600000000',
	address_street_number: '12',
	address_street: 'Rue des Tests',
	address_zip: '82000',
	address_city: 'Montauban',
	address_state: 'Occitanie',
	address_state_code: 'OC',
	address_country: 'France',
	products: [{ name: 'Bague', price: 100, quantity: 1 }]
};

describe('snapshotInvoiceTotals', () => {
	it('applique 5,5 % sur le HT et soustrait la remise', () => {
		const totals = snapshotInvoiceTotals({
			lines: [{ price: 100, quantity: 1 }],
			shippingCost: 3.34,
			discountAmount: 2
		});
		expect(totals.subtotalHt).toBe(100);
		expect(totals.taxRate).toBe(5.5);
		expect(totals.taxAmount).toBe(5.5);
		expect(totals.totalTtc).toBe(106.84);
	});
});

describe('formatInvoiceNumber', () => {
	it('pad le compteur sur 5 chiffres', () => {
		expect(formatInvoiceNumber(2026, 42)).toBe('FAC-2026-00042');
	});
});

describe('buildInvoiceView', () => {
	it('utilise l’instantané figé et le numéro FAC', () => {
		const invoice = buildInvoiceView(source);
		expect(invoice.number).toBe('FAC-2026-00001');
		expect(invoice.taxRate).toBe(5.5);
		expect(invoice.subtotalHt).toBe(100);
		expect(invoice.taxAmount).toBe(5.5);
		expect(invoice.totalTtc).toBe(109.09);
		expect(invoice.filename).toBe('Facture_FAC-2026-00001.pdf');
		expect(invoice.lines).toEqual([
			{ name: 'Bague', quantity: 1, unitPrice: 100, lineTotal: 100 }
		]);
	});
});

describe('renderInvoicePdf', () => {
	it('produit un buffer PDF', () => {
		const pdf = renderInvoicePdf(buildInvoiceView(source));
		expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
		expect(pdf.byteLength).toBeGreaterThan(200);
	});
});
