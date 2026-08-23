/**
 * PDF facture — une seule implémentation pour compte, admin et e-mail.
 *
 * COMMERCE-PLUGIN
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney } from '$lib/utils/formatMoney';
import type { InvoiceView } from './view';

function money(amount: number, currency: string): string {
	return formatMoney(amount, currency);
}

export function renderInvoicePdf(invoice: InvoiceView): Buffer {
	const doc = new jsPDF();
	const { company } = invoice;

	doc.setFontSize(16);
	doc.setFont('helvetica', 'bold');
	doc.text('FACTURE', 105, 20, { align: 'center' });

	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.text(company.name, 14, 40);
	doc.text(company.address, 14, 46);
	doc.text(company.city, 14, 52);
	doc.text(`Tél: ${company.phone}`, 14, 58);
	doc.text(`Email: ${company.email}`, 14, 64);
	doc.text(`TVA: ${company.vat}`, 14, 70);

	doc.text('Facturé à :', 130, 40);
	doc.text(invoice.customerName, 130, 46);
	invoice.addressLines.forEach((line, index) => {
		doc.text(line, 130, 52 + index * 6);
	});
	const afterAddress = 52 + invoice.addressLines.length * 6;
	doc.text(`Tél: ${invoice.customerPhone}`, 130, afterAddress);
	doc.text(`Email: ${invoice.customerEmail}`, 130, afterAddress + 6);

	doc.setFontSize(12);
	const issued = new Date(invoice.issuedAt).toLocaleString('fr-FR');
	doc.text(`Numéro de Facture: ${invoice.id}`, 14, 90);
	doc.text(`Date d'émission: ${issued}`, 14, 96);

	autoTable(doc, {
		startY: 110,
		head: [['Produit', 'Prix unitaire', 'Quantité', 'Total']],
		body:
			invoice.lines.length > 0
				? invoice.lines.map((line) => [
						line.name,
						money(line.unitPrice, invoice.currency),
						String(line.quantity),
						money(line.lineTotal, invoice.currency)
					])
				: [['—', '—', '—', '—']],
		styles: { fontSize: 10, cellPadding: 2 },
		headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] }
	});

	const lastTable = (
		doc as jsPDF & { lastAutoTable?: { finalY: number } }
	).lastAutoTable;
	const finalY = (lastTable?.finalY ?? 130) + 15;
	const titleX = 110;
	const valueX = 190;

	doc.setFontSize(12);
	doc.setFont('helvetica', 'bold');
	doc.text('Sous-total (HT):', titleX, finalY);
	doc.setFont('helvetica', 'normal');
	doc.text(money(invoice.subtotalHt, invoice.currency), valueX, finalY, { align: 'right' });

	doc.setFont('helvetica', 'bold');
	doc.text(`TVA (${invoice.taxRate}%):`, titleX, finalY + 8);
	doc.setFont('helvetica', 'normal');
	doc.text(money(invoice.taxAmount, invoice.currency), valueX, finalY + 8, { align: 'right' });

	doc.setFont('helvetica', 'bold');
	doc.text('Frais de livraison:', titleX, finalY + 16);
	doc.setFont('helvetica', 'normal');
	doc.text(money(invoice.shippingCost, invoice.currency), valueX, finalY + 16, { align: 'right' });

	doc.setFont('helvetica', 'bold');
	doc.text('Total:', titleX, finalY + 24);
	doc.text(money(invoice.totalTtc, invoice.currency), valueX, finalY + 24, { align: 'right' });

	doc.setFontSize(10);
	doc.setFont('helvetica', 'italic');
	doc.text('Merci pour votre commande !', 105, finalY + 40, { align: 'center' });

	return Buffer.from(doc.output('arraybuffer'));
}
