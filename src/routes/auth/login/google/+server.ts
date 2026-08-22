// -----------------------------------------------------------------------------
// Départ vers Google (OAuth 2.0 + PKCE).
//
// L'état et le vérificateur sont déposés dans deux cookies éphémères (10 min) que
// le retour compare : l'état déjoue la falsification de requête, le vérificateur
// prouve que le code d'autorisation est bien échangé par le client qui l'a demandé.
// -----------------------------------------------------------------------------

import { google } from '$lib/lucia/oauth';
import { generateCodeVerifier, generateState } from 'arctic';

import type { RequestEvent } from './$types';

export function GET(event: RequestEvent): Response {
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);

	event.cookies.set('google_oauth_state', state, {
		httpOnly: true,
		maxAge: 60 * 10,
		secure: import.meta.env.PROD,
		path: '/',
		sameSite: 'lax'
	});
	event.cookies.set('google_code_verifier', codeVerifier, {
		httpOnly: true,
		maxAge: 60 * 10,
		secure: import.meta.env.PROD,
		path: '/',
		sameSite: 'lax'
	});

	return new Response(null, {
		status: 302,
		headers: {
			Location: url.toString()
		}
	});
}
