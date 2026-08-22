// -----------------------------------------------------------------------------
// Gardes d'accès à l'espace d'administration.
//
// Deux formes, volontairement distinctes :
//   - `assertAdmin` redirige (pages, layout, hook) : un visiteur n'a rien à
//     voir ici, on l'oriente plutôt que de lui servir une 403.
//   - `requireAdmin` refuse net (actions) : un POST ne doit jamais aboutir, même
//     si le hook a été retiré. SvelteKit n'exécute pas le `load` du layout
//     avant une action, d'où ce second verrou.
// -----------------------------------------------------------------------------

import { error, redirect } from '@sveltejs/kit';

export type AdminLocals = App.Locals & {
	user: NonNullable<App.Locals['user']>;
	role: 'ADMIN';
};

/**
 * Exige un administrateur connecté, sinon redirige.
 *
 * Anonyme → connexion. Compte sans le rôle ADMIN → accueil. À utiliser dans
 * les `load` et le hook : c'est le comportement visible dans le navigateur.
 */
export function assertAdmin(locals: App.Locals): asserts locals is AdminLocals {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}
	if (locals.role !== 'ADMIN') {
		throw redirect(302, '/');
	}
}

/**
 * Exige un administrateur connecté, sinon 403.
 *
 * À appeler en première ligne de chaque action sous `/admin`. Ne redirige pas :
 * une mutation refusée ne doit pas se déguiser en navigation.
 */
export function requireAdmin(locals: App.Locals): asserts locals is AdminLocals {
	if (!locals.user || locals.role !== 'ADMIN') {
		throw error(403, 'Forbidden');
	}
}
