import { getUserFromEmail } from '$lib/lucia/user';
import {
	sendPasswordResetEmail,
	setPasswordResetSessionTokenCookie
} from '$lib/lucia/passwordReset';
import { invalidateUserPasswordResetSessions } from '$lib/prisma/passwordResetSession/passwordResetSession';
import { createPasswordResetSessionPrisma } from '$lib/prisma/passwordResetSession/passwordResetSession';
import { RefillingTokenBucket } from '$lib/lucia/rate-limit';
import { generateSessionToken } from '$lib/lucia/session';
import { fail, redirect } from '@sveltejs/kit';

import type { Actions, RequestEvent } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { forgotPasswordSchema } from '$lib/schema/auth/forgotPasswordSchema';
import { zod } from 'sveltekit-superforms/adapters';
import { generateForgotPasswordCode } from '$lib/lucia/utils';

const ipBucket = new RefillingTokenBucket<string>(3, 60);
// La clé est l'identifiant utilisateur, devenu un cuid avec PostgreSQL.
const userBucket = new RefillingTokenBucket<string>(3, 60);

export const load = async (event) => {
	if (event.locals.session !== null && event.locals.user !== null) {
		return redirect(302, '/auth/');
	}

	const forgotForm = await superValidate(event, zod(forgotPasswordSchema));

	return {
		forgotForm
	};
};

export const actions: Actions = {
	forgotPassword: async (event: RequestEvent) => {
		// TODO: Assumes X-Forwarded-For is always included.
		const formData = await event.request.formData();
		const form = await superValidate(formData, zod(forgotPasswordSchema));
		const { email } = form.data;
		if (!form.valid) {
			return fail(400, { form });
		}

		const clientIP = event.request.headers.get('X-Forwarded-For');
		if (clientIP !== null && !ipBucket.check(clientIP, 1)) {
			return message(form, 'Too many requests');
		}

		const user = await getUserFromEmail(email);

		if (user === null) {
			return message(form, 'Account does not exist');
		}
		if (clientIP !== null && !ipBucket.consume(clientIP, 1)) {
			return message(form, 'Too many requests');
		}

		if (!userBucket.consume(user.id, 1)) {
			return message(form, 'Too many requests');
		}

		await invalidateUserPasswordResetSessions(user.id);
		const sessionToken = generateSessionToken();
		// console.log(sessionToken, 'sessionToken');

		const code = await generateForgotPasswordCode();
		// console.log(code, 'code dkrjghdlsug hlg kftdjhlktjfdhk');
		// console.log(user, 'user lkjgtf tlhki jcftlohikjft clhk');
		const expirationDate = new Date(Date.now() + 15 * 60 * 1000);

		// Suppose que user existe et contient bien user.id, user.email, etc.
		const sessionData = {
			id: sessionToken,
			userId: user.id,
			email: user.email,
			code: code,
			expiresAt: expirationDate,
			emailVerified: false,
			// Toujours faux à la création : c'est l'étape /reset-password/2fa qui
			// valide le second facteur. Initialiser ce drapeau depuis isMfaEnabled
			// revenait à sauter la 2FA pour les comptes qui l'ont activée.
			twoFactorVerified: false
		};

		// console.log('sessionData reset sessionData created:', sessionData);

		// Crée la session
		const session = await createPasswordResetSessionPrisma(sessionData);

		// console.log('Password reset session created:', session);

		await sendPasswordResetEmail(session.email, session.code);

		setPasswordResetSessionTokenCookie(event, sessionToken, session.expiresAt);

		// console.log('Redirecting to: /auth/reset-password/verify-email');
		return redirect(302, '/auth/reset-password/verify-email');
	}
};
