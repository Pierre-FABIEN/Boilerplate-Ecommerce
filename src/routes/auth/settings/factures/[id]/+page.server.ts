import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getTransactionByIdForUser } from '$lib/prisma/transaction/getTransactionById';

/**
 * Facture du compte.
 *
 * COMMERCE-PLUGIN / AUTH-PLUGIN : uniquement la transaction du visiteur connecté.
 */
export const load = (async ({ params, locals }) => {
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

	return {
		transaction
	};
}) satisfies PageServerLoad;
