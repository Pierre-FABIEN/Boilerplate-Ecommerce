import { fail, redirect } from '@sveltejs/kit';
import { getUserFromEmail, getUserPasswordHash } from '$lib/lucia/user';
import { RefillingTokenBucket, Throttler } from '$lib/lucia/rate-limit';
import { verifyPasswordHash } from '$lib/lucia/password';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/lucia/session';

import type { SessionFlags } from '$lib/lucia/session';
import type { Actions, PageServerLoadEvent, RequestEvent } from './$types';
import { loginSchema } from '$lib/schema/auth/loginSchema';
import { zod } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms';

export const load = async (event: PageServerLoadEvent) => {
	if (event.locals.session !== null && event.locals.user !== null) {
		if (!event.locals.user.emailVerified) {
			return redirect(302, '/auth/verify-email');
		}

		console.log(event.locals.user, 'slkrjghxkgujh');

		if (!event.locals.user.googleId || !event.locals.user?.isMfaEnabled) {
			if (!event.locals.user.registered2FA) {
				if (event.locals.user.isMfaEnabled) {
					return redirect(302, '/auth/2fa/setup');
				}
			}
			if (!event.locals.session?.twoFactorVerified) {
				if (event.locals.user.isMfaEnabled) {
					return redirect(302, '/auth/2fa');
				}
			}
		}
		return redirect(302, '/auth/');
	}

	const loginForm = await superValidate(event, zod(loginSchema));

	return {
		loginForm
	};
};

// La clé est l'identifiant utilisateur, devenu un cuid avec PostgreSQL.
const throttler = new Throttler<string>([0, 1, 2, 4, 8, 16, 30, 60, 180, 300]);
const ipBucket = new RefillingTokenBucket<string>(20, 1);

export const actions: Actions = {
	login: async (event: RequestEvent) => {
		// TODO: Assumes X-Forwarded-For is always included.
		const clientIP = event.request.headers.get('X-Forwarded-For');
		if (clientIP !== null && !ipBucket.check(clientIP, 1)) {
			return fail(429, {
				message: 'Too many requests',
				email: ''
			});
		}

		const form = await superValidate(event, zod(loginSchema));
		const { email, password } = form.data;

		if (!form.valid) {
			return fail(400, { form });
		}

		const user = await getUserFromEmail(email);
		console.log(user);

		if (user === null) {
			return message(form, 'Le compte nexiste pas');
		}

		// Si l'utilisateur possède un googleId, c'est un utilisateur OAuth
		if (user.googleId) {
			return message(form, 'Connectez vous via Google OAuth');
		}

		if (clientIP !== null && !ipBucket.consume(clientIP, 1)) {
			return message(form, 'Too many requests');
		}
		if (!throttler.consume(user.id)) {
			return message(form, 'Too many requests');
		}
		const passwordHash = await getUserPasswordHash(user.id ?? undefined, email);

		// Un compte sans mot de passe n'en a jamais défini : la vérification
		// planterait au lieu de refuser proprement.
		if (passwordHash === null) {
			return message(form, 'Invalid password');
		}

		const validPassword = await verifyPasswordHash(passwordHash, password);
		if (!validPassword) {
			return message(form, 'Invalid password');
		}
		throttler.reset(user.id);
		const sessionFlags: SessionFlags = {
			twoFactorVerified: false
		};

		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id, sessionFlags);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);

		if (!user.emailVerified) {
			return redirect(302, '/auth/verify-email');
		}

		if (!user.registered2FA) {
			if (user.isMfaEnabled) {
				return redirect(302, '/auth/2fa/setup');
			}
		}

		if (!user.isMfaEnabled) {
			return redirect(302, '/');
		}
		redirect(302, '/auth/2fa');
	}
};
