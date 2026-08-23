/** Forme sérialisée d'une facture (aperçu HTML + PDF). */
export type InvoiceCompany = {
	name: string;
	address: string;
	city: string;
	phone: string;
	email: string;
	vat: string;
};

export type InvoiceLine = {
	name: string;
	quantity: number;
	unitPrice: number;
	lineTotal: number;
};

export type InvoiceView = {
	id: string;
	issuedAt: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	addressLines: string[];
	lines: InvoiceLine[];
	shippingCost: number;
	subtotalHt: number;
	taxRate: number;
	taxAmount: number;
	totalTtc: number;
	currency: string;
	filename: string;
	company: InvoiceCompany;
};

export type BordereauView = {
	id: string;
	filename: string;
	customerName: string;
	issuedAt: string;
	amountLabel: string;
	addressLines: string[];
	productLines: Array<{ name: string; quantity: number }>;
};
