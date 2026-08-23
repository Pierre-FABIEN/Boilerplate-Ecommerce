// -----------------------------------------------------------------------------
// Déconnexion (POST).
//
// Conservé pour les appels programmatiques. Le tiroir panier passe par l'action
// `/auth?/signout` (formulaire), qui gère CSRF et la redirection.
// -----------------------------------------------------------------------------

import type { RequestHandler } from './$types';
import { invalidateSession, deleteSessionTokenCookie } from '$lib/lucia/session';

export const POST: RequestHandler = async (event) => {
	if (!event.locals.session) {
		return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401 });
	}

	await invalidateSession(event.locals.session.id);
	deleteSessionTokenCookie(event);

	return new Response(JSON.stringify({ success: true }), { status: 200 });
};
