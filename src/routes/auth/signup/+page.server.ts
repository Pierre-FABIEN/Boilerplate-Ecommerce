// -----------------------------------------------------------------------------
// Inscription.
//
// Crée le compte, ouvre une session et envoie le code de vérification. Le compte
// existe donc avant que l'adresse soit confirmée, mais `emailVerified = false`
// le confine à la page de vérification.
//
// Un échec d'envoi d'email n'annule pas l'inscription : le code reste lisible en
// base pendant sa durée de validité, et l'utilisateur peut le faire renvoyer.
// -----------------------------------------------------------------------------

import { redirect, fail } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { signupSchema } from '$lib/schema/auth/signupSchema';

import { checkEmailAvailability } from '$lib/prisma/email/email';
import { createUser } from '$lib/lucia/user';
import { verifyPasswordStrength } from '$lib/lucia/password';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';

import {
	createEmailVerificationRequest,
	sendVerificationEmail,
	setEmailVerificationRequestCookie
} from '$lib/lucia/email-verification';

import { RefillingTokenBucket } from '$lib/server/rate-limit';
import { auth } from '$lib/lucia'; // ⬅️  on récupère l’instance Lucia
import { getSessionDeviceContext } from '$lib/lucia/deviceContext';
import { recordLoginEvent } from '$lib/prisma/loginEvent/loginEvent';

import type { PageServerLoad, Actions } from './$types';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const ipBucket = new RefillingTokenBucket<string>(3, 10, 'signup-ip'); // 3 req / 10 s

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
	// Parrainage : code brut porté par le lien partagé (`?ref=`), simplement
	// ré-affiché en champ caché du formulaire — la validation réelle n'a lieu
	// que dans l'action `signup`, jamais ici.
	const referralCode = event.url.searchParams.get('ref');
	return { form, referralCode };
};

/* -------------------------------------------------------------------------- */
/*  ACTIONS                                                                   */
/* -------------------------------------------------------------------------- */

export const actions: Actions = {
	signup: async (event) => {
		log('POST /signup hit');

		/* ---------- 1. Rate-limit pré-check -------------------------------- */
		const ip = event.request.headers.get('x-forwarded-for') ?? 'localhost';
		if (!(await ipBucket.check(ip, 1))) return fail(429, { message: 'Too many requests' });

		/* ---------- 2. Validation Zod + Superforms ------------------------- */
		// `formData` explicite (plutôt que `superValidate(event, ...)`) pour
		// pouvoir relire le champ caché `ref` (parrainage) à côté du schéma.
		const formData = await event.request.formData();
		const form = await superValidate(formData, zod(signupSchema));
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

		/* ---------- 2bis. Robustesse (longueur + Have I Been Pwned) -------- */
		if (!(await verifyPasswordStrength(password))) {
			setError(
				form,
				'password',
				'Ce mot de passe est trop courant ou a fuité, choisissez-en un autre.'
			);
			return fail(400, { form });
		}

		/* ---------- 3. Email déjà utilisé ? -------------------------------- */
		if (!(await checkEmailAvailability(email))) {
			log('❌ Email already exists:', email);
			log('⚠️ About to return early with simple object');
			// Retour d'un objet simple sérialisable pour test
			return message(form, 'vous etes deja inscrit avec cette adresse email.');
		}

		/* Consommation réelle du token RL */
		if (!(await ipBucket.consume(ip, 1))) return fail(429, { message: 'Too many requests' });

		/* ---------- 4. Création de l’utilisateur --------------------------- */
		const { referralEnabled } = await getStoreFeatureFlags();
		const referralCode = referralEnabled ? String(formData.get('ref') ?? '').trim() : '';
		const user = await createUser(email, username, password, referralCode || null);
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
		const device = getSessionDeviceContext(event.request);
		const session = await auth.createSession(user.id, {
			twoFactorVerified: false, // flags stockés dans la session
			...device
		});
		const cookie = auth.createSessionCookie(session.id);

		event.cookies.set(cookie.name, cookie.value, {
			path: '/',
			...cookie.attributes
		});
		log('✅  Session created', { userId: user.id });

		// Enregistré pour l'historique (`/auth/settings/sessions`), mais jamais
		// d'alerte « nouvel appareil » ici : c'est la toute première connexion
		// du compte, il n'y a par définition rien à comparer.
		await recordLoginEvent(user.id, 'signup', device);

		/* ---------- 7. Redirection finale ---------------------------------- */
		// Le compte existe mais son adresse n'est pas vérifiée : c'est la seule
		// étape possible à ce stade. La 2FA n'est proposée qu'ensuite, depuis les
		// paramètres du compte.
		log('Redirect to email verification');
		throw redirect(303, '/auth/verify-email');
	}
};
