// -----------------------------------------------------------------------------
// Perte de l'application d'authentification : usage du code de secours.
//
// Le code accepté retire la clé TOTP, invalide toutes les sessions du compte et
// délivre un nouveau code de secours. L'utilisateur est renvoyé vers la
// configuration de la 2FA, toujours exigée sur son compte.
// -----------------------------------------------------------------------------

import { recoveryCodeBucket, resetUser2FAWithRecoveryCode } from '$lib/lucia/2fa';
import { redirect } from '@sveltejs/kit';

import type { Actions, RequestEvent } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { recoveryCodeSchema } from '$lib/schema/auth/recoveryCodeSchema';
import { zod } from 'sveltekit-superforms/adapters';

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
	const verifyCodeForm = await superValidate(event, zod(recoveryCodeSchema));
	return { verifyCodeForm };
};

export const actions: Actions = {
	recovery_code: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		const code = formData.get('code');

		const form = await superValidate(formData, zod(recoveryCodeSchema));

		if (event.locals.session === null || event.locals.user === null) {
			return message(form, 'Not authenticated');
		}
		if (
			!event.locals.user.emailVerified ||
			!event.locals.user.registered2FA ||
			event.locals.session.twoFactorVerified
		) {
			return message(form, 'Forbidden');
		}
		if (!(await recoveryCodeBucket.check(event.locals.user.id, 1))) {
			return message(form, 'Too many requests');
		}

		if (typeof code !== 'string') {
			return message(form, 'Invalid or missing fields');
		}
		if (code === '') {
			return message(form, 'Please enter your code');
		}
		if (!(await recoveryCodeBucket.consume(event.locals.user.id, 1))) {
			return message(form, 'Too many requests');
		}
		const valid = await resetUser2FAWithRecoveryCode(event.locals.user.id, code);
		if (!valid) {
			return message(form, 'Invalid recovery code');
		}
		await recoveryCodeBucket.reset(event.locals.user.id);

		// La 2FA vient d'être retirée : l'utilisateur doit la reconfigurer si elle
		// reste exigée, sinon il peut rejoindre son espace directement.
		if (event.locals.user.isMfaEnabled) {
			return redirect(302, '/auth/2fa/setup');
		}
		return redirect(302, '/auth/');
	}
};
