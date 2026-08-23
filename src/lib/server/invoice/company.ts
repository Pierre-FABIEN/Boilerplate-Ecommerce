/**
 * Identité vendeur imprimée sur la facture.
 *
 * COMMERCE-PLUGIN : surcharger via `INVOICE_COMPANY_*` sans toucher au PDF.
 * Les valeurs par défaut restent celles déjà affichées (à remplacer en lot fiscal).
 */
import type { InvoiceCompany } from '$lib/invoice/types';

export type { InvoiceCompany };

function envOr(name: string, fallback: string): string {
	const value = process.env[name]?.trim();
	return value && value.length > 0 ? value : fallback;
}

export function getInvoiceCompany(): InvoiceCompany {
	return {
		name: envOr('INVOICE_COMPANY_NAME', 'MadeInDiamonds'),
		address: envOr('INVOICE_COMPANY_ADDRESS', '123 Rue des Affaires'),
		city: envOr('INVOICE_COMPANY_CITY', '75000 Paris, France'),
		phone: envOr('INVOICE_COMPANY_PHONE', '+33 1 23 45 67 89'),
		email: envOr('INVOICE_COMPANY_EMAIL', 'contact@madeindiamonds.com'),
		vat: envOr('INVOICE_COMPANY_VAT', 'FR123456789')
	};
}
