// -----------------------------------------------------------------------------
// Point d'entrée serveur du module d'authentification.
//
// `authHandle` est le SEUL raccordement de l'auth au cycle de requête. Il est
// branché dans `src/hooks.server.ts` ; retirer le module se résume donc, pour ce
// fichier-là, à supprimer un import et un élément de la séquence.
//
// Responsabilités, dans l'ordre :
//   1. résoudre la session depuis le cookie et rafraîchir l'utilisateur ;
//   2. exposer l'identité dans `event.locals` (voir `src/app.d.ts`) ;
//   3. imposer la double authentification quand le compte l'exige ;
//   4. fermer l'espace compte aux visiteurs anonymes.
//
// Ce qui n'y est PAS, volontairement : la limitation de débit globale et le
// panier en cours, qui ne relèvent pas de l'identité et restent dans
// `src/hooks.server.ts`.
// -----------------------------------------------------------------------------

import { redirect, type Handle } from '@sveltejs/kit';

import { auth } from '$lib/lucia';
import type { User } from '$lib/lucia/user';
import type { Session } from '$lib/lucia/session';
import { sessionIdentityCacheKey, SESSION_IDENTITY_CACHE_TTL_SECONDS } from '$lib/lucia/session';
import { getUserByIdPrisma } from '$lib/prisma/user/user';
import { findSessionById, touchSessionActivity } from '$lib/prisma/session/sessions';
import { isRedisConfigured, getRedis } from '$lib/server/redis';

/** Passe à `true` pour tracer la résolution de session dans la console. */
const DEBUG = false;

function log(...args: unknown[]) {
	if (DEBUG) console.log('[auth:hook]', ...args);
}

/** Identité résolue pour une requête. */
type ResolvedIdentity = {
	session: Session | null;
	user: User | null;
};

/**
 * Efface le cookie de session côté navigateur.
 *
 * Utilisé quand la session est invalide ou que l'utilisateur associé est
 * introuvable : mieux vaut déconnecter que servir un état incohérent.
 */
function clearSessionCookie(event: Parameters<Handle>[0]['event']) {
	const blank = auth.createBlankSessionCookie();
	event.cookies.set(blank.name, blank.value, { path: '/', ...blank.attributes });
}

/**
 * Relit l'utilisateur en base à chaque requête.
 *
 * Lucia ne renvoie que les attributs figés à la création de la session ; or
 * l'email peut avoir été vérifié, la 2FA configurée ou le rôle modifié depuis.
 * Les gardes ci-dessous doivent raisonner sur l'état courant, pas sur celui de
 * la connexion.
 */
async function loadFreshUser(userId: string): Promise<User | null> {
	const freshUser = await getUserByIdPrisma(userId);
	if (!freshUser) return null;

	return {
		id: freshUser.id,
		email: freshUser.email,
		username: freshUser.username,
		emailVerified: freshUser.emailVerified,
		// « 2FA configurée » se déduit de la présence d'une clé TOTP, et se
		// distingue de « 2FA exigée » (`isMfaEnabled`).
		registered2FA: freshUser.totpKey !== null,
		googleId: freshUser.googleId,
		name: freshUser.name,
		picture: freshUser.picture,
		role: freshUser.role,
		isMfaEnabled: freshUser.isMfaEnabled,
		totpKey: freshUser.totpKey ? freshUser.totpKey.toString() : null
	};
}

/** Recharge la session depuis la base pour disposer du drapeau `twoFactorVerified`. */
async function loadFreshSession(sessionId: string, fresh: boolean): Promise<Session | null> {
	const dbSession = await findSessionById(sessionId);
	if (!dbSession) return null;

	return {
		id: dbSession.id,
		userId: dbSession.userId,
		expiresAt: dbSession.expiresAt,
		twoFactorVerified: dbSession.twoFactorVerified,
		oauthProvider: dbSession.oauthProvider,
		fresh
	};
}

/**
 * Valide le cookie de session et renvoie l'identité correspondante.
 *
 * Une erreur de lecture n'interrompt jamais la requête : on repart en visiteur
 * anonyme, cookie effacé, plutôt que de renvoyer une 500 sur toutes les pages.
 */
async function resolveIdentity(event: Parameters<Handle>[0]['event']): Promise<ResolvedIdentity> {
	const sessionId = event.cookies.get(auth.sessionCookieName);
	if (!sessionId) {
		log('aucun cookie de session');
		return { session: null, user: null };
	}

	// `auth.validateSession` + `loadFreshUser` + `loadFreshSession` = 3
	// aller-retours Postgres, sur CHAQUE requête authentifiée. Un cache court
	// (quelques secondes) absorbe l'essentiel du trafic répété d'un même
	// visiteur sans retarder la prise en compte d'une déconnexion/promotion
	// au-delà de ce délai. Seules les identités positives sont mises en
	// cache : une session invalide/absente repasse toujours par le chemin
	// complet ci-dessous, pour ne jamais retarder un `clearSessionCookie`.
	const cacheKey = sessionIdentityCacheKey(sessionId);
	if (isRedisConfigured()) {
		const cached = await getRedis().get<ResolvedIdentity>(cacheKey);
		if (cached) return cached;
	}

	try {
		const { session: luciaSession, user: luciaUser } = await auth.validateSession(sessionId);

		let user: User | null = null;
		if (luciaUser) {
			user = await loadFreshUser(luciaUser.id);
			if (!user) {
				log('utilisateur introuvable en base, déconnexion');
				clearSessionCookie(event);
				return { session: null, user: null };
			}
		}

		const session = luciaSession
			? await loadFreshSession(luciaSession.id, luciaSession.fresh)
			: null;

		// « Dernière activité », pour /auth/settings/sessions. Fire-and-forget :
		// une écriture ratée ne doit jamais faire échouer la requête, et ce
		// chemin n'est déjà emprunté qu'une fois par ~8s par visiteur actif (le
		// cache d'identité ci-dessus absorbe le reste) — pas besoin d'un seuil
		// de fraîcheur supplémentaire avant d'écrire.
		if (session) {
			touchSessionActivity(session.id).catch((error) => {
				log('échec de la mise à jour de dernière activité', error);
			});
		}

		const identity: ResolvedIdentity = { session, user };
		if (isRedisConfigured() && session && user) {
			await getRedis().set(cacheKey, identity, { ex: SESSION_IDENTITY_CACHE_TTL_SECONDS });
		}
		return identity;
	} catch (error) {
		log('session invalide', error);
		clearSessionCookie(event);
		return { session: null, user: null };
	}
}

/**
 * Résolution de session et gardes d'accès.
 *
 * À placer avant tout hook qui lit `event.locals.user`.
 */
export const authHandle: Handle = async ({ event, resolve }) => {
	const { session, user } = await resolveIdentity(event);

	event.locals = {
		...event.locals,
		session,
		user,
		role: user?.role ?? null,
		isMfaEnabled: user?.isMfaEnabled ?? false,
		registered2FA: user?.registered2FA ?? false
	};

	// Un compte qui exige la 2FA reste confiné aux pages 2FA jusqu'à ce qu'elle
	// soit configurée puis validée pour la session courante. La garde est ici, et
	// non dans chaque page, pour qu'aucune route ajoutée plus tard ne l'oublie.
	if (user?.isMfaEnabled) {
		if (!user.registered2FA && !event.url.pathname.startsWith('/auth/2fa/setup')) {
			log('2FA à configurer → /auth/2fa/setup');
			throw redirect(302, '/auth/2fa/setup');
		}
		if (
			user.registered2FA &&
			session &&
			!session.twoFactorVerified &&
			!event.url.pathname.startsWith('/auth/2fa')
		) {
			log('2FA à valider → /auth/2fa');
			throw redirect(302, '/auth/2fa');
		}
	}

	// L'espace compte n'est jamais servi à un visiteur anonyme. Les pages ont leur
	// propre garde ; celle-ci couvre aussi les sous-routes futures.
	if (event.url.pathname.startsWith('/auth/settings') && !user) {
		log('accès anonyme aux paramètres → /auth/login');
		throw redirect(302, '/auth/login');
	}

	return resolve(event);
};
