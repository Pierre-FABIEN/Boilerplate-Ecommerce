// -----------------------------------------------------------------------------
// Configuration de la double authentification.
//
// Une clé TOTP est tirée à chaque affichage de la page et présentée en QR code ;
// elle n'est enregistrée qu'une fois un code valide saisi, preuve que
// l'application de l'utilisateur la partage réellement. La clé effectivement
// validée voyage donc dans le formulaire, et non en session.
//
// L'enregistrement délivre un nouveau code de secours, affiché à l'étape
// suivante et jamais réaffiché ensuite.
// -----------------------------------------------------------------------------

import { createTOTPKeyURI, verifyTOTP } from '@oslojs/otp';
import { fail, redirect } from '@sveltejs/kit';
import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { updateUserTOTPKey } from '$lib/lucia/user';
import { setSessionAs2FAVerified } from '$lib/lucia/session';
import { RefillingTokenBucket } from '$lib/server/rate-limit';
import { message, superValidate } from 'sveltekit-superforms';
import { totpSchema } from '$lib/schema/auth/totpSchema';
import { renderSVG } from 'uqr';

import type { Actions, RequestEvent } from './$types';
import { zod } from 'sveltekit-superforms/adapters';
import { auth } from '$lib/lucia';

// La clé est l'identifiant utilisateur, devenu un cuid avec PostgreSQL.
const totpUpdateBucket = new RefillingTokenBucket<string>(3, 60 * 10);

export const load = async (event: RequestEvent) => {
	if (event.locals.session === null || event.locals.user === null) {
		return redirect(302, '/auth/login');
	}
	if (!event.locals.user.emailVerified) {
		return redirect(302, '/auth/verify-email');
	}

	//console.log(event.locals, 'slkrjghxkgujh SETUP');
	if (!event.locals.user.googleId || !event.locals.user.isMfaEnabled) {
		if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
			if (event.locals.user.isMfaEnabled) {
				return redirect(302, '/auth/2fa');
			}
		}
	}

	// Générer la clé TOTP et le QR code
	const totpKey = new Uint8Array(20);
	crypto.getRandomValues(totpKey);
	const encodedTOTPKey = encodeBase64(totpKey);
	// Le pseudonyme est facultatif (comptes Google) : l'email sert alors de libellé
	// dans l'application d'authentification.
	const accountLabel = event.locals.user.username ?? event.locals.user.email;
	const keyURI = createTOTPKeyURI('Demo', accountLabel, totpKey, 30, 6);

	// Générer le QR code
	const qrcode = renderSVG(keyURI);

	// Valider le formulaire avec Superform
	const totpForm = await superValidate(event, zod(totpSchema));

	return {
		encodedTOTPKey,
		qrcode,
		totpForm
	};
};

export const actions: Actions = {
	setuptotp: async (event: RequestEvent) => {
		//console.log('Début de l’action setup TOTP');

		const formData = await event.request.formData();
		const form = await superValidate(formData, zod(totpSchema));

		if (event.locals.session === null || event.locals.user === null) {
			console.warn('Utilisateur non authentifié ou session inexistante');
			return message(form, 'Not authenticated');
		}
		if (!event.locals.user.emailVerified) {
			console.warn('Email non vérifié pour l’utilisateur:', event.locals.user.email);
			return message(form, 'Email not verified');
		}
		if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
			console.warn('2FA déjà configurée pour l’utilisateur:', event.locals.user.id);
			return message(form, 'Two-factor already set up');
		}
		if (!(await totpUpdateBucket.check(event.locals.user.id, 1))) {
			console.warn('Trop de tentatives pour l’utilisateur:', event.locals.user.id);
			return message(form, 'Too many requests');
		}

		if (!form.valid) {
			console.warn('Échec de la validation du formulaire:', form.errors);
			return message(form, 'Form validation failed');
		}

		const { encodedTOTPKey, code } = form.data;

		//console.log('Données reçues:', { encodedTOTPKey, code });

		if (encodedTOTPKey.length !== 28) {
			console.warn('Longueur de la clé encodée invalide:', encodedTOTPKey.length);
			return message(form, 'Invalid encoded key length');
		}

		let key: Uint8Array;
		try {
			key = decodeBase64(encodedTOTPKey);
			//console.log('Clé décodée avec succès:', key);
		} catch (error) {
			console.error('Erreur lors du décodage de la clé:', error);
			return message(form, 'Invalid encoded key format');
		}

		if (key.byteLength !== 20) {
			console.warn('Longueur de la clé invalide:', key.byteLength);
			return message(form, 'Invalid key length');
		}

		try {
			//console.log('Validation du code TOTP...');
			const isValid = verifyTOTP(key, 30, 6, code);

			if (!isValid) {
				console.warn('Code TOTP invalide pour la clé:', key);
				return message(form, 'Invalid TOTP code');
			}
			//console.log('Code TOTP valide.');
		} catch (error) {
			console.error('Erreur lors de la validation du code TOTP:', error);
			return fail(500, { message: 'Internal server error', form });
		}

		try {
			//console.log('Mise à jour de la clé TOTP dans la base de données...');
			await updateUserTOTPKey(event.locals.session.userId, key);
			//console.log('Clé TOTP mise à jour avec succès.');

			//console.log('Marquage de la session comme vérifiée pour la 2FA...');
			await setSessionAs2FAVerified(event.locals.session.id);

			//console.log('Session marquée comme vérifiée.');
			event.locals.session.twoFactorVerified = true;
			// après avoir mis à jour la BDD et marqué la session comme vérifiée
			event.locals.user.isMfaEnabled = true;
			event.locals.user.registered2FA = true;
		} catch (error) {
			console.error('Erreur lors de la mise à jour de la clé TOTP ou de la session:', error);
			return fail(500, { message: 'Internal server error', form });
		}

		//console.log('Redirection vers la page des codes de récupération.');
		return redirect(303, '/auth/recovery-code');
	}
};
