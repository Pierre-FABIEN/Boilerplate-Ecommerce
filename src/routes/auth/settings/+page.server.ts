// -----------------------------------------------------------------------------
// Paramètres du compte : adresse email, mot de passe, double authentification.
//
// Trois actions, trois précautions :
//   - changer d'adresse n'écrit rien tout de suite ; l'adresse n'est remplacée
//     qu'après validation du code envoyé à la nouvelle ;
//   - changer de mot de passe exige le mot de passe courant et révoque les
//     autres sessions, la session en cours étant réémise ;
//   - activer la 2FA renvoie vers sa configuration, qui délivre le code de secours.
// -----------------------------------------------------------------------------

import {
	createEmailVerificationRequest,
	sendVerificationEmail,
	sendVerificationEmailBucket,
	setEmailVerificationRequestCookie
} from '$lib/lucia/email-verification';
import { fail, redirect } from '@sveltejs/kit';
import { checkEmailAvailability } from '$lib/prisma/email/email';
import { verifyPasswordHash } from '$lib/lucia/password';
import { getUserPasswordHash, getUserRecoverCode, updateUserPassword } from '$lib/lucia/user';
import {
	createSession,
	generateSessionToken,
	invalidateUserSessions,
	setSessionTokenCookie
} from '$lib/lucia/session';
import { ExpiringTokenBucket } from '$lib/server/rate-limit';
import { message, superValidate } from 'sveltekit-superforms';
import { emailSchema, passwordSchema } from '$lib/schema/auth/settingsSchemas';
import { zod } from 'sveltekit-superforms/adapters';

import type { Actions, RequestEvent } from './$types';
import type { SessionFlags } from '$lib/lucia/session';
import { isMfaEnabledSchema } from '$lib/schema/users/MfaEnabledSchema';
import { getUserMFA, updateUserMFA } from '$lib/prisma/user/user';

const passwordUpdateBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

export const load = async (event: RequestEvent) => {
	let recoveryCode: string | null = null;

	if (event.locals.session === null || event.locals.user === null) {
		return redirect(302, '/auth/login');
	}

	if (!event.locals.user.emailVerified) {
		return redirect(302, '/auth/verify-email');
	}

	if (!event.locals.user.googleId) {
		if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
			if (event.locals.user.isMfaEnabled) {
				return redirect(302, '/auth/2fa');
			}
		}

		// Récupérer le code de récupération si l'utilisateur utilise l'authentification à deux facteurs
		if (event.locals.user.registered2FA) {
			recoveryCode = await getUserRecoverCode(event.locals.user.id);
		}
	}
	// Initialiser les formulaires Superform
	const passwordForm = await superValidate(event, zod(passwordSchema));
	const emailForm = await superValidate(event, zod(emailSchema));
	const isMfaEnabledForm = await superValidate(
		{ isMfaEnabled: event.locals.user.isMfaEnabled }, // Passer la valeur actuelle
		zod(isMfaEnabledSchema)
	);

	return {
		recoveryCode,
		user: event.locals.user,
		passwordForm,
		emailForm,
		isMfaEnabledForm
	};
};

export const actions: Actions = {
	password: async (event: RequestEvent) => {
		// Le formulaire est validé d'abord : les messages d'erreur doivent passer
		// par `message(form, ...)` pour que superforms les expose côté client.
		const form = await superValidate(event, zod(passwordSchema));

		if (event.locals.session === null || event.locals.user === null) {
			return message(form, 'Not authenticated', { status: 401 });
		}
		if (event.locals.user.isMfaEnabled) {
			if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
				return message(form, 'Forbidden', { status: 403 });
			}
		}
		if (!(await passwordUpdateBucket.check(event.locals.session.id, 1))) {
			return message(form, 'Too many requests', { status: 429 });
		}

		if (!form.valid) {
			return fail(400, { form });
		}

		const { password, new_password } = form.data;

		const passwordHash = await getUserPasswordHash(event.locals.user.id);
		const validPassword = await verifyPasswordHash(passwordHash, password);
		if (!validPassword) {
			return message(form, 'Incorrect password', { status: 400 });
		}

		await passwordUpdateBucket.reset(event.locals.session.id);
		await invalidateUserSessions(event.locals.user.id);
		await updateUserPassword(event.locals.user.id, new_password);

		const sessionToken = generateSessionToken();
		const sessionFlags: SessionFlags = {
			twoFactorVerified: event.locals.session.twoFactorVerified
		};
		const session = await createSession(sessionToken, event.locals.user.id, sessionFlags);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);

		return message(form, 'Password modified successfully');
	},

	email: async (event: RequestEvent) => {
		const form = await superValidate(event, zod(emailSchema));

		if (event.locals.session === null || event.locals.user === null) {
			return message(form, 'Not authenticated', { status: 401 });
		}
		if (event.locals.user.isMfaEnabled) {
			if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
				return message(form, 'Forbidden', { status: 403 });
			}
		}
		if (!(await sendVerificationEmailBucket.check(event.locals.user.id, 1))) {
			return message(form, 'Too many requests', { status: 429 });
		}

		if (!form.valid) {
			return fail(400, { form });
		}

		const { email } = form.data;

		const emailAvailable = await checkEmailAvailability(email);
		if (!emailAvailable) {
			return message(form, 'This email is already used', { status: 400 });
		}

		const verificationRequest = await createEmailVerificationRequest(event.locals.user.id, email);
		try {
			await sendVerificationEmail(verificationRequest.email, verificationRequest.code);
		} catch (error) {
			console.error("Échec de l'envoi du code de vérification :", error);
		}
		setEmailVerificationRequestCookie(event, verificationRequest);

		redirect(302, '/auth/verify-email');
	},

	isMfaEnabled: async (event: RequestEvent) => {
		const form = await superValidate(event, zod(isMfaEnabledSchema));

		if (!form.valid) {
			return fail(400, { form });
		}
		// Récupérer l'état actuel
		const currentStatus = await getUserMFA(event.locals.user.id);

		// Inverser la propriété isMfaEnabled
		const newMfaStatus = !currentStatus.isMfaEnabled;

		// Mettre à jour la base de données
		await updateUserMFA(event.locals.user.id, {
			isMfaEnabled: newMfaStatus
		});

		return message(form, {
			text: 'Authentication modifiée',
			newStatus: newMfaStatus
		});
	}
};
