// -----------------------------------------------------------------------------
// Déconnexion (POST).
//
// Endpoint plutôt qu'action de formulaire, pour être appelable depuis n'importe
// quel composant — le menu du panier notamment. La session est invalidée en base
// avant que le cookie soit effacé : un cookie conservé ne rouvrira rien.
// -----------------------------------------------------------------------------

import type { RequestHandler } from './$types';
import { invalidateSession } from '$lib/lucia/session';
import { auth } from '$lib/lucia';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.session) {
		return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401 });
	}

	await invalidateSession(locals.session.id);
	cookies.delete(auth.sessionCookieName, { path: '/' });

	return new Response(JSON.stringify({ success: true }), { status: 200 });
};
