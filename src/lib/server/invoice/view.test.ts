import { describe, expect, it } from 'vitest';
import { buildInvoiceView } from './view';
import { renderInvoicePdf } from './pdf';

const source = {
	id: 'tx_test_1',
	createdAt: new Date('2026-08-23T10:00:00.000Z'),
	amount: 123.34,
	currency: 'eur',
	shippingCost: 3.34,
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

describe('buildInvoiceView', () => {
	it('fige les totaux TTC et extraie une TVA 20 % du hors-port', () => {
		const invoice = buildInvoiceView(source);
		expect(invoice.totalTtc).toBeCloseTo(123.34, 2);
		expect(invoice.shippingCost).toBeCloseTo(3.34, 2);
		expect(invoice.taxRate).toBe(20);
		expect(invoice.subtotalHt + invoice.taxAmount).toBeCloseTo(120, 2);
		expect(invoice.filename).toBe('Facture_tx_test_1.pdf');
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
