import { getAllTransactionsDashboard } from '$lib/prisma/transaction/getAllTransactionsDashboard';
import { latestUsers } from '$lib/prisma/user/user';

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load = (async ({ locals }) => {
	// AUTH-PLUGIN ▼ garde d'accès au tableau de bord. Sans authentification, il
	// faut un autre mécanisme (réseau privé, mot de passe d'accès, sous-domaine
	// protégé) : ne pas se contenter de supprimer ces contrôles.
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	if (locals.role !== 'ADMIN') {
		throw redirect(302, '/');
	}
	// AUTH-PLUGIN ▲

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
