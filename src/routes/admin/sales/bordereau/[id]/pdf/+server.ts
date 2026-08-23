import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTransactionById } from '$lib/prisma/transaction/getTransactionById';
import { buildBordereauView, renderBordereauPdf } from '$lib/server/invoice/bordereau';
import { pdfDownloadResponse } from '$lib/server/invoice/http';

/**
 * Téléchargement PDF — bordereau admin.
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
		error(404, 'Bordereau introuvable');
	}

	const view = buildBordereauView(transaction);
	return pdfDownloadResponse(renderBordereauPdf(view), view.filename);
};
