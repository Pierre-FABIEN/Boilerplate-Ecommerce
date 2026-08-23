import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getTransactionsByUserId } from '$lib/prisma/transaction/getTransactionsByUserId';

export const load = (async ({ locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		throw redirect(302, '/auth/login');
	}

	const transactions = await getTransactionsByUserId(userId);

	return {
		transactions
	};
}) satisfies PageServerLoad;
