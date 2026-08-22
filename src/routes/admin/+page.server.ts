import { getAllTransactionsDashboard } from '$lib/prisma/transaction/getAllTransactionsDashboard';
import { latestUsers } from '$lib/prisma/user/user';
import { assertAdmin } from '$lib/admin/guards';

import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	assertAdmin(locals);

	const transactions = await getAllTransactionsDashboard();

	const latestUsersFetch = await latestUsers();

	return {
		latestUsersFetch,
		transactions,
		// Projection volontairement réduite : `locals.user` porte des données
		// sensibles (clé TOTP chiffrée) qui ne doivent pas partir vers le client.
		user: {
			id: locals.user.id,
			email: locals.user.email,
			username: locals.user.username,
			role: locals.user.role
		},
		role: locals.role
	};
}) satisfies PageServerLoad;
