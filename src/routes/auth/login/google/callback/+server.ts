// -----------------------------------------------------------------------------
// Retour de Google.
//
// Contrôle l'état et le vérificateur PKCE, lit les informations du compte dans le
// jeton d'identité, puis retrouve l'utilisateur par `googleId` ou le crée.
// L'adresse est considérée comme vérifiée d'emblée, Google l'ayant validée.
// -----------------------------------------------------------------------------

import { google } from '$lib/lucia/oauth';
import { ObjectParser } from '@pilcrowjs/object-parser';
import { getUserFromGoogleId, getUserFromEmail } from '$lib/lucia/user';
import { decodeIdToken } from 'arctic';
import { auth } from '$lib/lucia';
import { createUserWithGoogleOAuth } from '$lib/prisma/user/user';
import { GOOGLE_CLIENT_ID } from '$env/static/private';
import { isDummySecret } from '$lib/server/dummy-secrets';

import type { RequestEvent } from './$types';
import type { OAuth2Tokens } from 'arctic';

function isE2eGoogleBypass(code: string, email: string | null): boolean {
	return (
		isDummySecret(GOOGLE_CLIENT_ID) &&
		code.startsWith('e2e-') &&
		!!email &&
		email.startsWith('e2e-')
	);
}

async function establishGoogleSession(event: RequestEvent, userId: string): Promise<Response> {
	const session = await auth.createSession(userId, { twoFactorVerified: false });
	const sessionCookie = auth.createSessionCookie(session.id);
	event.cookies.set(sessionCookie.name, sessionCookie.value, {
		path: '/',
		...sessionCookie.attributes
	});

	return new Response(null, {
		status: 302,
		headers: {
			Location: '/'
		}
	});
}

export async function GET(event: RequestEvent): Promise<Response> {
	const storedState = event.cookies.get('google_oauth_state') ?? null;
	const codeVerifier = event.cookies.get('google_code_verifier') ?? null;
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');

	if (!storedState || !codeVerifier || !code || !state || storedState !== state) {
		return new Response('Invalid request. Please restart the process.', { status: 400 });
	}

	const e2eEmail = event.url.searchParams.get('email');
	if (isE2eGoogleBypass(code, e2eEmail)) {
		const googleId = `e2e-google-${e2eEmail}`;
		let user = await getUserFromGoogleId(googleId);
		if (!user) {
			user = await getUserFromEmail(e2eEmail as string);
		}
		if (!user) {
			const created = await createUserWithGoogleOAuth(
				googleId,
				e2eEmail as string,
				'E2e Google',
				''
			);
			return establishGoogleSession(event, created.id);
		}
		return establishGoogleSession(event, user.id);
	}

	let tokens: OAuth2Tokens;
	try {
		tokens = await google.validateAuthorizationCode(code, codeVerifier);
	} catch {
		return new Response('Authorization failed. Please try again.', { status: 400 });
	}

	const claims = decodeIdToken(tokens.idToken());
	const claimsParser = new ObjectParser(claims);

	const googleId = claimsParser.getString('sub');
	const name = claimsParser.getString('name');
	const picture = claimsParser.getString('picture');
	const email = claimsParser.getString('email');

	let user = await getUserFromGoogleId(googleId);
	if (!user) {
		user = await getUserFromEmail(email);

		if (!user) {
			const created = await createUserWithGoogleOAuth(googleId, email, name, picture);
			return establishGoogleSession(event, created.id);
		}
	}

	return establishGoogleSession(event, user.id);
}
