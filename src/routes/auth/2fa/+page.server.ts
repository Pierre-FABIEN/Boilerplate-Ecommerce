// -----------------------------------------------------------------------------
// Validation du second facteur pour la session courante.
//
// Page imposée par `authHandle` à toute session dont la 2FA n'est pas encore
// validée. Le code accepté réémet la session avec `twoFactorVerified = true` :
// c'est cette nouvelle session qui donne accès au reste du site.
// -----------------------------------------------------------------------------

import { totpBucket } from '$lib/lucia/2fa';
import { fail, redirect } from '@sveltejs/kit';
import { getUserTOTPKey } from '$lib/lucia/user';
import { verifyTOTP } from '@oslojs/otp';
import { setSessionAs2FAVerified } from '$lib/lucia/session';
import { auth } from '$lib/lucia';

import type { Actions, RequestEvent } from './$types';
import { zod } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms';
import { totpCodeSchema } from '$lib/schema/auth/totpCodeSchema';

export const load = async (event: RequestEvent) => {
	if (event.locals.session === null || event.locals.user === null) {
		return redirect(302, '/auth/login');
	}
	if (!event.locals.user.emailVerified) {
		return redirect(302, '/auth/verify-email');
	}
	if (!event.locals.user.registered2FA) {
		if (event.locals.user.isMfaEnabled) {
			return redirect(302, '/auth/2fa/setup');
		}
	}
	if (event.locals.session.twoFactorVerified) {
		return redirect(302, '/auth/');
	}
	const totpForm = await superValidate(event, zod(totpCodeSchema));
	return { totpForm };
};

export const actions: Actions = {
	totp: async ({ request, locals, cookies }) => {
		const formData = await request.formData();

		const form = await superValidate(formData, zod(totpCodeSchema));

		if (!form.valid) {
			return message(form, 'Invalid data');
		}

		if (locals.session === null || locals.user === null) {
			return message(form, 'Not authenticated');
		}

		if (
			!locals.user.emailVerified ||
			!locals.user.registered2FA ||
			locals.session.twoFactorVerified
		) {
			return message(form, 'Forbidden');
		}

		if (!(await totpBucket.check(locals.user.id, 1))) {
			return message(form, 'Too many requests');
		}

		const code = formData.get('code');
		if (typeof code !== 'string') {
			return message(form, 'Invalid or missing fields');
		}
		if (code === '') {
			return message(form, 'Please enter your code');
		}
		if (!(await totpBucket.consume(locals.user.id, 1))) {
			return message(form, 'Too many requests');
		}

		const totpKey = await getUserTOTPKey(locals.user.id);
		if (totpKey === null) {
			return message(form, 'Forbidden');
		}

		try {
			const isValid = verifyTOTP(totpKey, 30, 6, code);

			if (!isValid) {
				// `message` et non `fail` : sinon le texte n'atteint pas le store
				// superforms et l'utilisateur ne voit aucune erreur.
				return message(form, 'Invalid TOTP code', { status: 400 });
			}
			// console.log('Vérification TOTP réussie.');
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error('Erreur lors de la vérification TOTP :', error.message);
			} else {
				console.error('Erreur inconnue lors de la vérification TOTP :', error);
			}
			return fail(500, { message: 'Internal server error', form });
		}

		await totpBucket.reset(locals.user.id);
		await setSessionAs2FAVerified(locals.session.id);

		// Invalider la session actuelle de Lucia
		await auth.invalidateSession(locals.session.id);

		// Créer une nouvelle session pour l'utilisateur avec twoFactorVerified à true
		const newSession = await auth.createSession(locals.user.id, { twoFactorVerified: true });

		// Définir le nouveau cookie de session
		const newSessionCookie = auth.createSessionCookie(newSession.id);
		cookies.set(newSessionCookie.name, newSessionCookie.value, {
			path: '/',
			...newSessionCookie.attributes
		});

		// console.log('locals.session.twoFactorVerified avant redirection (nouvelle session):', true); // Devrait toujours être true pour la nouvelle session

		redirect(302, '/auth/');
	}
};
