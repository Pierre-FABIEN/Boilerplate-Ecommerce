import type { LayoutServerLoad } from './$types';
import { assertAdmin } from '$lib/admin/guards';

/**
 * Données partagées par toutes les pages d'administration.
 *
 * La garde vit aussi dans `adminHandle` ; celle-ci couvre une page oubliée si le
 * hook venait à être retiré. Projection volontairement réduite : `locals.user`
 * porte la clé TOTP chiffrée, qui ne doit jamais partir vers le navigateur.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	assertAdmin(locals);

	return {
		user: {
			id: locals.user.id,
			email: locals.user.email,
			username: locals.user.username,
			role: locals.user.role
		}
	};
};
