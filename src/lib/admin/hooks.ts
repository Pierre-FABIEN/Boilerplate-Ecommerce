// -----------------------------------------------------------------------------
// Point d'entrée serveur du module d'administration.
//
// `adminHandle` est le SEUL raccordement de l'admin au cycle de requête. Il est
// branché dans `src/hooks.server.ts` APRÈS `authHandle`, qui peuple
// `event.locals.user` et `event.locals.role`. Retirer le module se résume, pour
// ce fichier-là, à supprimer un import et un élément de la séquence.
//
// Couvre GET comme POST : sans cela, une action (`?/deleteUser`) resterait
// joignable même si chaque page vérifiait le rôle dans son `load`.
// -----------------------------------------------------------------------------

import { type Handle } from '@sveltejs/kit';
import { assertAdmin } from './guards';

/** Passe à `true` pour tracer les refus d'accès dans la console. */
const DEBUG = false;

function log(...args: unknown[]) {
	if (DEBUG) console.log('[admin:hook]', ...args);
}

/**
 * Ferme `/admin` aux visiteurs qui ne sont pas administrateurs.
 *
 * À placer après `authHandle`.
 */
export const adminHandle: Handle = async ({ event, resolve }) => {
	if (!event.url.pathname.startsWith('/admin')) {
		return resolve(event);
	}

	log('contrôle', event.request.method, event.url.pathname, 'rôle=', event.locals.role);
	assertAdmin(event.locals);
	return resolve(event);
};
