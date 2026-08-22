// -----------------------------------------------------------------------------
// Réinitialisation, étape 1 : code reçu par email.
//
// Le code validé marque la session de réinitialisation comme vérifiée et, au
// passage, confirme l'adresse du compte si elle correspond — recevoir ce code en
// est la preuve.
// -----------------------------------------------------------------------------

import { validatePasswordResetSessionRequest } from '$lib/lucia/passwordReset';
import { setPasswordResetSessionAsEmailVerified } from '$lib/prisma/passwordResetSession/passwordResetSession';
import { ExpiringTokenBucket } from '$lib/server/rate-limit';
import { setUserAsEmailVerifiedIfEmailMatches } from '$lib/lucia/user';
import { redirect } from '@sveltejs/kit';

import type { Actions, RequestEvent } from './$types';
import { verifyCodeSchema } from '$lib/schema/auth/verifyCodeSchema';
import { zod } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms';

// La clé est l'identifiant utilisateur, devenu un cuid avec PostgreSQL.
const bucket = new ExpiringTokenBucket<string>(5, 60 * 30);

export const load = async (event: RequestEvent) => {
	const { session } = await validatePasswordResetSessionRequest(event);
	// // console.log(
	// 	session,
	// 	'uhguy C:/Web/XplicitWeb/src/routes/auth/reset-password/verify-email/+page.server.ts'
	// );
	if (session === null) {
		// console.log('Session is null, redirecting to /auth/forgot-password');
		return redirect(302, '/auth/forgot-password');
	}

	if (!session.emailVerified) {
		// console.log('Email is not verified, staying on verify email page.');
	}
	const verifyEmailForm = await superValidate(event, zod(verifyCodeSchema));

	return {
		email: session.email,
		verifyEmailForm
	};
};

export const actions: Actions = {
	verify: async (event: RequestEvent) => {
		const { session } = await validatePasswordResetSessionRequest(event);
		const formData = await event.request.formData();
		// console.log(formData, 'form data');

		const form = await superValidate(formData, zod(verifyCodeSchema));
		// console.log(form, 'oiuhoiuh');

		if (session === null) {
			return message(form, 'Not authenticated');
		}
		if (session.emailVerified) {
			return message(form, 'Forbidden');
		}
		if (!bucket.check(session.userId, 1)) {
			return message(form, 'Too many requests');
		}

		const { code } = form.data;

		if (typeof code !== 'string') {
			return message(form, 'Invalid or missing fields');
		}
		if (code === '') {
			return message(form, 'Please enter your code');
		}
		if (!bucket.consume(session.userId, 1)) {
			return message(form, 'Too many requests');
		}
		if (code !== session.code) {
			return message(form, 'Incorrect code');
		}
		bucket.reset(session.userId);
		await setPasswordResetSessionAsEmailVerified(session.id);
		const emailMatches = await setUserAsEmailVerifiedIfEmailMatches(session.userId, session.email);
		if (!emailMatches) {
			return message(form, 'Please restart the process');
		}
		return redirect(302, '/auth/reset-password/2fa');
	}
};
