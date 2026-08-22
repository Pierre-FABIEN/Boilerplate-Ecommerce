import {
	deletePasswordResetSessionTokenCookie,
	validatePasswordResetSessionRequest
} from '$lib/lucia/passwordReset';
import { invalidateUserPasswordResetSessions } from '$lib/prisma/passwordResetSession/passwordResetSession';
import { fail, redirect } from '@sveltejs/kit';
import { verifyPasswordStrength } from '$lib/lucia/password';
import {
	createSession,
	generateSessionToken,
	invalidateUserSessions,
	setSessionTokenCookie
} from '$lib/lucia/session';
import { updateUserPassword } from '$lib/lucia/user';

import type { Actions, RequestEvent } from './$types';
import type { SessionFlags } from '$lib/lucia/session';
import { message, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { resetPasswordSchema } from '$lib/schema/auth/resetPasswordSchema';

export const load = async (event: RequestEvent) => {
	const { session, user } = await validatePasswordResetSessionRequest(event);
	if (session === null) {
		return redirect(302, '/auth/forgot-password');
	}
	if (!session.emailVerified) {
		return redirect(302, '/auth/reset-password/verify-email');
	}
	if (user.registered2FA && !session.twoFactorVerified) {
		return redirect(302, '/auth/reset-password/2fa');
	}

	const resetPasswordForm = await superValidate(event, zod(resetPasswordSchema));
	return {
		resetPasswordForm
	};
};

export const actions: Actions = {
	resetPassword: async (event: RequestEvent) => {
		const { session: passwordResetSession, user } =
			await validatePasswordResetSessionRequest(event);
		const formData = await event.request.formData();
		const form = await superValidate(formData, zod(resetPasswordSchema));
		if (passwordResetSession === null) {
			return message(form, 'Not authenticated');
		}
		if (!passwordResetSession.emailVerified) {
			return message(form, 'Forbidden');
		}
		if (user.registered2FA && !passwordResetSession.twoFactorVerified) {
			return message(form, 'Forbidden');
		}

		// La validation Zod doit aussi s'appliquer côté serveur : sans ce contrôle,
		// un appel direct pouvait imposer un mot de passe ne respectant pas la
		// politique de robustesse.
		if (!form.valid) {
			return fail(400, { form });
		}

		const { password } = form.data;
		await invalidateUserPasswordResetSessions(passwordResetSession.userId);
		await invalidateUserSessions(passwordResetSession.userId);
		await updateUserPassword(passwordResetSession.userId, password);

		const sessionFlags: SessionFlags = {
			twoFactorVerified: passwordResetSession.twoFactorVerified
		};
		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id, sessionFlags);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);
		deletePasswordResetSessionTokenCookie(event);
		return redirect(302, '/auth/');
	}
};
