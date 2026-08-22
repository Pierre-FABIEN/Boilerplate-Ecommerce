// -----------------------------------------------------------------------------
// Présentation du code de secours, juste après la configuration de la 2FA.
//
// Seul moment où il est lisible : il est déchiffré à l'affichage et n'est plus
// consultable ensuite. Un nouveau code n'est délivré qu'en reconfigurant la 2FA.
// -----------------------------------------------------------------------------

import { getUserRecoverCode } from '$lib/lucia/user';
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';

export const load = async (event: RequestEvent) => {
	// ────────────────────────────
	// console.log('[recovery-code] load() start');
	// console.log('  locals.user   →', event.locals.user);
	// console.log('  locals.session→', event.locals.session);
	// ────────────────────────────

	/* 1. Auth */
	if (event.locals.session === null || event.locals.user === null) {
		// console.log('❌ Pas de session → redirect /auth/login');
		return redirect(302, '/auth/login');
	}

	/* 2. E-mail */
	if (!event.locals.user.emailVerified) {
		// console.log('❌ E-mail non vérifié → redirect /auth/verify-email');
		return redirect(302, '/auth/verify-email');
	}

	/* 3. MFA / Google */
	if (!event.locals.user.googleId) {
		if (!event.locals.user.registered2FA) {
			// console.log('ℹ️  2FA non encore configurée');
			if (event.locals.user.isMfaEnabled) {
				// console.log('➡️  isMfaEnabled = true → redirect /auth/2fa/setup');
				return redirect(302, '/auth/2fa/setup');
			}
		}
		if (!event.locals.session.twoFactorVerified) {
			// console.log('ℹ️  2FA configurée mais session NON vérifiée');
			if (event.locals.user.isMfaEnabled) {
				// console.log('➡️  Session doit passer par /auth/2fa');
				return redirect(302, '/auth/2fa');
			}
		}
	}

	/* 4. Récupération du code */
	// console.log('✅ Toutes les vérifications passées → on récupère le recovery code');
	const recoveryCode = await getUserRecoverCode(event.locals.user.id);

	// console.log('[recovery-code] load() done → retourne recoveryCode');
	return { recoveryCode };
};
