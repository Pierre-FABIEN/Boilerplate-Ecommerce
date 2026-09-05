// -----------------------------------------------------------------------------
// Vérification de l'adresse email.
//
// Sert deux cas : la confirmation à l'inscription et le changement d'adresse
// depuis les paramètres. Dans les deux cas c'est l'adresse portée par la demande
// en cours qui est validée, jamais celle du compte.
//
// Les erreurs passent par `message()` et non par `fail()` : Superforms doit
// pouvoir réarmer le formulaire, sans quoi la page reste bloquée après un code
// refusé.
// -----------------------------------------------------------------------------

import { fail, redirect } from '@sveltejs/kit';
import {
	createEmailVerificationRequest,
	deleteEmailVerificationRequestCookie,
	deleteUserEmailVerificationRequest,
	getUserEmailVerificationRequestFromRequest,
	sendVerificationEmail,
	sendVerificationEmailBucket,
	setEmailVerificationRequestCookie
} from '$lib/lucia/email-verification';

import { invalidateUserPasswordResetSessions } from '$lib/prisma/passwordResetSession/passwordResetSession';
import { updateUserEmailAndSetEmailAsVerified } from '$lib/lucia/user';
import { ExpiringTokenBucket } from '$lib/server/rate-limit';

import type { Actions, RequestEvent } from './$types';
import { verifyCodeSchema } from '$lib/schema/auth/verifyCodeSchema';
import { zod } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms';
import { getUserByEmailPrisma } from '$lib/prisma/user/user';

// La clé est l'identifiant utilisateur, devenu un cuid avec PostgreSQL.
const bucket = new ExpiringTokenBucket<string>(5, 60 * 30);

const DEBUG = false;

function log(...args: unknown[]) {
	if (DEBUG) console.log('[verify]', ...args);
}

export const load = async (event) => {
	log('load start');

	if (!event.locals.user) {
		log('No user in locals → redirect to login');
		throw redirect(302, '/auth/login');
	}

	// ✅ Recharge l’utilisateur avec données fraîches (emailVerified à jour)
	const freshUser = await getUserByEmailPrisma(event.locals.user.email);
	if (!freshUser) {
		log('User not found in DB → redirect to login');
		throw redirect(302, '/auth/login');
	}

	// ✅ Si on détecte une mise à jour d'état (ex: vérification de l’email), on sync locals
	if (freshUser.emailVerified !== event.locals.user.emailVerified) {
		log('User state updated → syncing locals.user');
		event.locals.user.emailVerified = freshUser.emailVerified;
	}

	const verifyCode = await superValidate(zod(verifyCodeSchema));

	let verificationRequest = await getUserEmailVerificationRequestFromRequest(event);
	log('Initial request', verificationRequest);

	if (verificationRequest === null || Date.now() >= verificationRequest.expiresAt.getTime()) {
		log('Request missing or expired');

		if (freshUser.emailVerified) {
			log('Email already verified → redirect to /auth/');
			throw redirect(302, '/auth/');
		}

		verificationRequest = await createEmailVerificationRequest(freshUser.id, freshUser.email);
		log('New verification request created', verificationRequest);

		sendVerificationEmail(verificationRequest.email, verificationRequest.code);
		setEmailVerificationRequestCookie(event, verificationRequest);
	}

	log('load done → render form');
	return {
		verifyCode,
		email: verificationRequest.email
	};
};

export const actions: Actions = {
	verifyCode: verifyCode,
	resendCode: resendEmail
};

async function verifyCode(event: RequestEvent) {
	log('Action: verifyCode');

	// Le formulaire est piloté par superforms : chaque sortie doit renvoyer son
	// `form`, sinon le client n'apprend jamais la fin de la soumission et refuse
	// les tentatives suivantes.
	const form = await superValidate(event, zod(verifyCodeSchema));

	if (event.locals.session === null || event.locals.user === null) {
		log('No session/user in event');
		return message(form, 'Not authenticated', { status: 401 });
	}

	if (
		event.locals.user.isMfaEnabled &&
		event.locals.user.registered2FA &&
		!event.locals.session.twoFactorVerified
	) {
		log('MFA enabled but not verified');
		return message(form, 'Forbidden', { status: 403 });
	}

	if (!(await bucket.check(event.locals.user.id, 1))) {
		log('Rate limit pre-check failed');
		return message(form, 'Too many requests', { status: 429 });
	}

	let verificationRequest = await getUserEmailVerificationRequestFromRequest(event);
	log('Verification request fetched', verificationRequest);

	if (verificationRequest === null) {
		log('Missing verification request');
		return message(form, 'Please restart the process', { status: 400 });
	}

	if (!form.valid) {
		log('Invalid form', form.errors);
		return fail(400, { form });
	}

	const { code } = form.data;

	if (!(await bucket.consume(event.locals.user.id, 1))) {
		log('Rate limit consume failed');
		return message(form, 'Too many requests', { status: 429 });
	}

	if (Date.now() >= verificationRequest.expiresAt.getTime()) {
		log('Code expired → regenerating');

		verificationRequest = await createEmailVerificationRequest(
			verificationRequest.userId,
			verificationRequest.email
		);
		await sendVerificationEmail(verificationRequest.email, verificationRequest.code);
		setEmailVerificationRequestCookie(event, verificationRequest);

		return message(form, 'The verification code was expired. We sent another code to your inbox.', {
			status: 400
		});
	}

	if (verificationRequest.code !== code) {
		log('Invalid code provided');
		return message(form, 'Incorrect code', { status: 400 });
	}

	log('Code valid → confirming email');
	// Ces écritures conditionnent l'état lu par la page suivante : sans attente,
	// la redirection peut précéder la mise à jour et renvoyer l'utilisateur ici.
	await deleteUserEmailVerificationRequest(event.locals.user.id);
	await invalidateUserPasswordResetSessions(event.locals.user.id);
	await updateUserEmailAndSetEmailAsVerified(event.locals.user.id, verificationRequest.email);
	deleteEmailVerificationRequestCookie(event);

	if (!event.locals.user.registered2FA && event.locals.user.isMfaEnabled) {
		log('MFA enabled → redirect to setup');
		return redirect(302, '/auth/2fa/setup');
	}

	log('Email verified → redirect to dashboard');
	return redirect(303, '/auth/');
}

async function resendEmail(event: RequestEvent) {
	log('Action: resendEmail');

	if (event.locals.session === null || event.locals.user === null) {
		log('No session/user');
		return fail(401, { resend: { message: 'Not authenticated' } });
	}

	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		log('2FA required but not verified');
		return fail(403, { resend: { message: 'Forbidden' } });
	}

	if (!(await sendVerificationEmailBucket.check(event.locals.user.id, 1))) {
		log('Rate-limit resend check failed');
		return fail(429, { resend: { message: 'Too many requests' } });
	}

	let verificationRequest = await getUserEmailVerificationRequestFromRequest(event);

	if (verificationRequest === null) {
		if (event.locals.user.emailVerified) {
			log('User already verified → resend forbidden');
			return fail(403, { resend: { message: 'Forbidden' } });
		}

		if (!(await sendVerificationEmailBucket.consume(event.locals.user.id, 1))) {
			log('Rate-limit consume failed on resend');
			return fail(429, { resend: { message: 'Too many requests' } });
		}

		verificationRequest = await createEmailVerificationRequest(
			event.locals.user.id,
			event.locals.user.email
		);
		log('New verification request created (no previous one)');
	} else {
		if (!(await sendVerificationEmailBucket.consume(event.locals.user.id, 1))) {
			log('Rate-limit consume failed on resend (existing request)');
			return fail(429, { resend: { message: 'Too many requests' } });
		}

		verificationRequest = await createEmailVerificationRequest(
			event.locals.user.id,
			verificationRequest.email
		);
		log('Verification request regenerated');
	}

	sendVerificationEmail(verificationRequest.email, verificationRequest.code);
	setEmailVerificationRequestCookie(event, verificationRequest);
	log('Email resent to', verificationRequest.email);

	return {
		resend: {
			message: 'A new code was sent to your inbox.'
		}
	};
}
