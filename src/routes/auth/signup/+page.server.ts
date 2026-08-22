// -----------------------------------------------------------------------------
// src/routes/auth/signup/+page.server.ts
// -----------------------------------------------------------------------------

import { redirect, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { signupSchema } from '$lib/schema/auth/signupSchema';

import { checkEmailAvailability } from '$lib/prisma/email/email';
import { createUser } from '$lib/lucia/user';

import {
	createEmailVerificationRequest,
	sendVerificationEmail,
	setEmailVerificationRequestCookie
} from '$lib/lucia/email-verification';

import { RefillingTokenBucket } from '$lib/lucia/rate-limit';
import { auth } from '$lib/lucia'; // ⬅️  on récupère l’instance Lucia

import type { PageServerLoad, Actions } from './$types';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const ipBucket = new RefillingTokenBucket<string>(3, 10); // 3 req / 10 s

const DEBUG = false;

function log(...args: unknown[]) {
	if (DEBUG) console.log('[signup]', ...args);
}

/* -------------------------------------------------------------------------- */
/*  PAGE LOAD                                                                 */
/* -------------------------------------------------------------------------- */

export const load: PageServerLoad = async (event) => {
	log('load() start', {
		isAuthenticated: !!event.locals.user,
		user: event.locals.user?.id
	});

	/* Redirections rapides si déjà connecté -------------------------------- */
	if (event.locals.session && event.locals.user) {
		const u = event.locals.user;

		if (!u.emailVerified) return redirect(302, '/auth/verify-email');
		if (!u.googleId && u.isMfaEnabled) {
			if (!u.registered2FA) return redirect(302, '/auth/2fa/setup');
			if (!event.locals.session.twoFactorVerified) return redirect(302, '/auth/2fa');
		}
		return redirect(302, '/auth/');
	}

	/* Formulaire vierge ----------------------------------------------------- */
	const form = await superValidate(zod(signupSchema));
	log('load() done → empty form');
	return { form };
};

/* -------------------------------------------------------------------------- */
/*  ACTIONS                                                                   */
/* -------------------------------------------------------------------------- */

export const actions: Actions = {
	signup: async (event) => {
		log('POST /signup hit');

		/* ---------- 1. Rate-limit pré-check -------------------------------- */
		const ip = event.request.headers.get('x-forwarded-for') ?? 'localhost';
		if (!ipBucket.check(ip, 1)) return fail(429, { message: 'Too many requests' });

		/* ---------- 2. Validation Zod + Superforms ------------------------- */
		const form = await superValidate(event, zod(signupSchema));
		log('Form received', form.data);

		if (!form.valid) {
			log('❌ Form validation failed:', form.errors);
			return fail(400, { 
				message: 'Erreurs de validation. Vérifiez vos données.'
			});
		}

		// Extraire toutes les données du formulaire pour éviter les problèmes de sérialisation
		const { email, username, password } = form.data;
		log('📧 Extracted data:', { email, username });

		/* ---------- 3. Email déjà utilisé ? -------------------------------- */
		if (!(await checkEmailAvailability(email))) {
			log('❌ Email already exists:', email);
			log('⚠️ About to return early with simple object');
			// Retour d'un objet simple sérialisable pour test
			return message(form , 'vous etes deja inscrit avec cette adresse email.')
		}

		/* Consommation réelle du token RL */
		if (!ipBucket.consume(ip, 1)) return fail(429, { message: 'Too many requests' });

		/* ---------- 4. Création de l’utilisateur --------------------------- */
		const user = await createUser(email, username, password);
		log('✅  User created', { id: user.id, email: user.email });

		/* ---------- 5. Demande de vérification e-mail ---------------------- */
		const evReq = await createEmailVerificationRequest(user.id, user.email);
		try {
			await sendVerificationEmail(evReq.email, evReq.code);
			log('📧  Verification e-mail sent →', evReq.email);
		} catch (err) {
			log('⚠️  FAILED to send verification e-mail', err);
		}
		setEmailVerificationRequestCookie(event, evReq);

		/* ---------- 6. Création session + cookie Lucia --------------------- */
		// 👉 on laisse Lucia s’en occuper
		const session = await auth.createSession(user.id, {
			twoFactorVerified: false // flags stockés dans la session
		});
		const cookie = auth.createSessionCookie(session.id);

		event.cookies.set(cookie.name, cookie.value, {
			path: '/',
			...cookie.attributes
		});
		log('✅  Session created', { sid: session.id });

		/* ---------- 7. Redirection finale ---------------------------------- */
		log('Redirect to 2FA setup');
		throw redirect(303, '/auth/2fa/setup');
	}
};
