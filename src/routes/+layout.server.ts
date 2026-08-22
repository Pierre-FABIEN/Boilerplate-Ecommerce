import type { LayoutServerLoad } from './$types';

/**
 * Données partagées par toutes les pages.
 *
 * Elles traversent le réseau : n'exposer ici que le strict nécessaire à
 * l'interface (menu compte, garde d'affichage), jamais un secret.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		// AUTH-PLUGIN ▼ alimente le menu compte (`Cart.svelte`, `Navigation.svelte`).
		// Projection explicite : `locals.user` porte aussi la clé TOTP chiffrée, qui
		// ne doit jamais quitter le serveur. Toute nouvelle propriété doit être
		// ajoutée ici sciemment.
		user: locals.user
			? {
					id: locals.user.id,
					email: locals.user.email,
					username: locals.user.username,
					name: locals.user.name,
					picture: locals.user.picture,
					role: locals.user.role,
					emailVerified: locals.user.emailVerified,
					isMfaEnabled: locals.user.isMfaEnabled,
					registered2FA: locals.user.registered2FA
				}
			: null
		// AUTH-PLUGIN ▲

		// Panier serveur : décommenter pour hydrater le panier client depuis la
		// commande en cours et activer la synchronisation (`+layout.svelte`).
		// pendingOrder: locals.pendingOrder
	};
};
