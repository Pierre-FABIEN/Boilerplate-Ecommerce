/** Forme sérialisée d'une facture (aperçu HTML + PDF). */
export type InvoiceCompany = {
	name: string;
	address: string;
	city: string;
	phone: string;
	email: string;
	vat: string;
	siret: string;
	/** URL Cloudinary du logo (`/admin/identite`) — `null` si non fourni,
	 * jamais de logo par défaut inventé. */
	logoUrl: string | null;
};

export type InvoiceLine = {
	name: string;
	quantity: number;
	unitPrice: number;
	lineTotal: number;
	/** Personnalisation client (photo + message) présente au moment du
	 * paiement — voir `Custom`, `prisma/schema.prisma`. Absent pour un
	 * article standard. */
	customizations?: Array<{ image: string; userMessage: string }>;
};

export type InvoiceView = {
	id: string;
	number: string;
	issuedAt: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	addressLines: string[];
	lines: InvoiceLine[];
	shippingCost: number;
	discountAmount: number;
	promoCode: string;
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
	productLines: Array<{
		name: string;
		quantity: number;
		customizations?: Array<{ image: string; userMessage: string }>;
	}>;
};
