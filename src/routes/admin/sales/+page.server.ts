/**
 * Liste des ventes.
 *
 * ADMIN-PLUGIN / COMMERCE-PLUGIN : surface admin du tunnel (Transaction).
 */
import { getAllTransactions } from '$lib/prisma/transaction/getAllTransactions';
import type { PageServerLoad } from './$types';

export const load = (async () => {
	const transactions = await getAllTransactions();

	return {
		transactions
	};
}) satisfies PageServerLoad;
