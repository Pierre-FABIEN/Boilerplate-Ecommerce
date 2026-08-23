import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTransactionById } from '$lib/prisma/transaction/getTransactionById';
import { pdfDownloadResponse } from '$lib/server/invoice/http';
import { renderInvoicePdf } from '$lib/server/invoice/pdf';
import { buildInvoiceView } from '$lib/server/invoice/view';

/**
 * Téléchargement PDF — facture admin.
 *
 * ADMIN-PLUGIN / COMMERCE-PLUGIN
 */
export const GET: RequestHandler = async ({ params }) => {
	const transactionId = params.id;
	if (!transactionId) {
		error(400, 'Transaction ID is missing');
	}

	const transaction = await getTransactionById(transactionId);
	if (!transaction) {
		error(404, 'Facture introuvable');
	}

	const invoice = buildInvoiceView(transaction);
	return pdfDownloadResponse(renderInvoicePdf(invoice), invoice.filename);
};
