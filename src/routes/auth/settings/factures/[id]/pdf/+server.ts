import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTransactionByIdForUser } from '$lib/prisma/transaction/getTransactionById';
import { pdfDownloadResponse } from '$lib/server/invoice/http';
import { renderInvoicePdf } from '$lib/server/invoice/pdf';
import { buildInvoiceView } from '$lib/server/invoice/view';

/**
 * Téléchargement PDF — facture du visiteur connecté.
 *
 * COMMERCE-PLUGIN / AUTH-PLUGIN
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		throw redirect(302, '/auth/login');
	}

	const transactionId = params.id;
	if (!transactionId) {
		error(400, 'Transaction ID is missing');
	}

	const transaction = await getTransactionByIdForUser(transactionId, userId);
	if (!transaction) {
		error(404, 'Facture introuvable');
	}

	const invoice = buildInvoiceView(transaction);
	return pdfDownloadResponse(renderInvoicePdf(invoice), invoice.filename);
};
