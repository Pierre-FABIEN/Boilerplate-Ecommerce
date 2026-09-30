/**
 * Bordereau d'expédition — PDF serveur, mêmes champs d'adresse que la Transaction.
 *
 * COMMERCE-PLUGIN
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BordereauView } from '$lib/invoice/types';
import { formatMoney } from '$lib/utils/formatMoney';
import { readCustomizations, type InvoiceSource } from './view';

export type { BordereauView };

export function buildBordereauView(source: InvoiceSource): BordereauView {
	const street = [source.address_street_number, source.address_street]
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const zipCity = [source.address_zip, source.address_city]
		.filter((part) => part && String(part).trim())
		.join(' ')
		.trim();
	const regionCountry = [source.address_state, source.address_country]
		.filter((part) => part && String(part).trim())
		.join(', ');

	const products = Array.isArray(source.products) ? source.products : [];

	return {
		id: source.id,
		filename: `Bordereau_${source.id}.pdf`,
		customerName: source.customer_details_name?.trim() || 'N/A',
		issuedAt: (source.createdAt instanceof Date
			? source.createdAt
			: new Date(source.createdAt)
		).toISOString(),
		amountLabel: formatMoney(source.amount, source.currency || 'EUR'),
		addressLines: [street, zipCity, regionCountry].filter((line) => line.length > 0),
		productLines: products.map((entry) => {
			const product = (entry ?? {}) as {
				name?: unknown;
				quantity?: unknown;
				customizations?: unknown;
			};
			const quantity = Number(product.quantity);
			return {
				name: typeof product.name === 'string' && product.name.trim() ? product.name : 'Article',
				quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
				customizations: readCustomizations(product.customizations)
			};
		})
	};
}

export function renderBordereauPdf(view: BordereauView): Buffer {
	const doc = new jsPDF();

	doc.setFontSize(16);
	doc.text("BORDEREAU D'EXPÉDITION", 14, 20);

	doc.setFontSize(12);
	doc.text(`ID Transaction: ${view.id}`, 14, 30);
	doc.text(`Montant: ${view.amountLabel}`, 14, 40);
	doc.text(`Date de création: ${new Date(view.issuedAt).toLocaleString('fr-FR')}`, 14, 50);

	doc.setFontSize(14);
	doc.text('Adresse de livraison:', 14, 70);
	doc.setFontSize(12);
	doc.text(view.customerName, 14, 80);
	view.addressLines.forEach((line, index) => {
		doc.text(line, 14, 88 + index * 8);
	});

	// Message de personnalisation client (photo + texte, voir `Custom` en
	// base) : seul le texte est repris ici, l'image reste consultable dans
	// l'aperçu admin — l'embarquer dans ce PDF demanderait un fetch/encodage
	// dédié (voir `fetchLogoForPdf`), hors périmètre de ce correctif.
	const hasCustomizations = view.productLines.some((line) => line.customizations?.length);

	autoTable(doc, {
		startY: 120,
		head: hasCustomizations
			? [['Produit', 'Quantité', 'Personnalisation']]
			: [['Produit', 'Quantité']],
		body:
			view.productLines.length > 0
				? view.productLines.map((line) => {
						const row = [line.name, String(line.quantity)];
						if (hasCustomizations) {
							row.push(
								line.customizations
									?.map((c) => c.userMessage)
									.filter(Boolean)
									.join(' / ') ?? ''
							);
						}
						return row;
					})
				: [hasCustomizations ? ['—', '—', '—'] : ['—', '—']]
	});

	return Buffer.from(doc.output('arraybuffer'));
}
