/**
 * Totaux facture — même taux que le checkout (5,5 % sur le HT).
 *
 * COMMERCE-PLUGIN
 */
export const INVOICE_TAX_RATE = 5.5;

export type InvoiceLineInput = {
	price: number;
	quantity: number;
};

export type InvoiceTotals = {
	subtotalHt: number;
	taxRate: number;
	taxAmount: number;
	shippingCost: number;
	discountAmount: number;
	totalTtc: number;
};

function money2(value: number): number {
	const n = Number.isFinite(value) ? value : 0;
	return Math.round(n * 100) / 100;
}

export function snapshotInvoiceTotals(input: {
	lines: InvoiceLineInput[];
	shippingCost: number;
	discountAmount?: number;
	paidTotal?: number;
}): InvoiceTotals {
	const subtotalHt = money2(
		input.lines.reduce((sum, line) => sum + money2(line.price) * Math.max(0, line.quantity), 0)
	);
	const taxAmount = money2(subtotalHt * (INVOICE_TAX_RATE / 100));
	const shippingCost = money2(input.shippingCost);
	const discountAmount = money2(Math.max(0, input.discountAmount ?? 0));
	const computedTtc = money2(subtotalHt + taxAmount + shippingCost - discountAmount);
	const totalTtc = input.paidTotal != null ? money2(input.paidTotal) : computedTtc;

	return {
		subtotalHt,
		taxRate: INVOICE_TAX_RATE,
		taxAmount,
		shippingCost,
		discountAmount,
		totalTtc
	};
}
