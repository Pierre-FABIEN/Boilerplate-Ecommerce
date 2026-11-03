// -----------------------------------------------------------------------------
// Point d'entrée serveur de l'authentification — remplace `#lib/lucia/hooks.ts`
// (voir MIGRATION_BETTER_AUTH.md). Mêmes responsabilités, mêmes noms de champs
// dans `event.locals` (voir `src/app.d.ts`) : aucun consommateur en dehors de
// ce fichier n'a besoin de changer.
//
// Différence structurelle avec l'ancien `authHandle` : Better Auth ne crée
// jamais de session tant que le second facteur (si exigé) n'a pas été
// validé — il n'y a donc plus d'état « session ouverte, 2FA en attente » à
// re-vérifier à chaque requête. La garde ci-dessous ne couvre plus que le cas
// « 2FA exigée mais pas encore configurée » (`/auth/2fa/setup`), le reste de
// l'ancienne garde (redirection vers `/auth/2fa`) disparaît : elle n'a plus
// de raison d'être.
// -----------------------------------------------------------------------------

import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { auth } from '#lib/auth';
import { toLocalsUser, type User } from '#lib/auth/user';
import { toLocalsSession, sessionIdentityCacheKey, type Session } from '#lib/auth/session';
import { isRedisConfigured, getRedis } from '#lib/server/redis';
import { touchSessionActivity } from '#lib/prisma/session/sessions';

const DEBUG = false;
function log(...args: unknown[]) {
	if (DEBUG) console.log('[auth:hook]', ...args);
}

export const SESSION_IDENTITY_CACHE_TTL_SECONDS = 8;

type ResolvedIdentity = { session: Session | null; user: User | null };

async function resolveIdentity(event: Parameters<Handle>[0]['event']): Promise<ResolvedIdentity> {
	const cookieValue = event.cookies.get('better-auth.session_token');
	if (!cookieValue) {
		log('aucun cookie de session');
		return { session: null, user: null };
	}

	const cacheKey = sessionIdentityCacheKey(cookieValue);
	if (isRedisConfigured()) {
		const cached = await getRedis().get<ResolvedIdentity>(cacheKey);
		if (cached) return cached;
	}

	try {
		const result = await auth.api.getSession({ headers: event.request.headers });
		if (!result) {
			return { session: null, user: null };
		}

		const identity: ResolvedIdentity = {
			session: toLocalsSession(result.session),
			user: toLocalsUser(result.user)
		};

		// Best-effort, jamais bloquant pour la requête — voir
		// `touchSessionActivity`. Borné par le cache ci-dessous : au plus une
		// écriture toutes les `SESSION_IDENTITY_CACHE_TTL_SECONDS` par visiteur.
		void touchSessionActivity(result.session.id).catch(() => {});

		if (isRedisConfigured()) {
			await getRedis().set(cacheKey, identity, { ex: SESSION_IDENTITY_CACHE_TTL_SECONDS });
		}
		return identity;
	} catch (error) {
		log('session invalide', error);
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

	// `event.locals` est en lecture seule depuis SvelteKit 3 (RequestEvent) :
	// on ne peut plus le remplacer en bloc, seulement muter ses propriétés.
	Object.assign(event.locals, {
		session,
		user,
		role: user?.role ?? null,
		isMfaEnabled: user?.isMfaEnabled ?? false,
		registered2FA: user?.registered2FA ?? false
	});

	// Un compte qui exige la 2FA mais ne l'a pas encore configurée reste
	// confiné à la page de configuration. Une fois configurée, le second
	// facteur est déjà passé au moment où une session existe (voir
	// commentaire de tête) : plus besoin de re-vérifier à chaque requête.
	if (
		user?.isMfaEnabled &&
		!user.registered2FA &&
		!event.url.pathname.startsWith('/auth/2fa/setup')
	) {
		log('2FA à configurer → /auth/2fa/setup');
		throw redirect(302, '/auth/2fa/setup');
	}

	// L'espace compte n'est jamais servi à un visiteur anonyme. Les pages ont leur
	// propre garde ; celle-ci couvre aussi les sous-routes futures.
	if (event.url.pathname.startsWith('/auth/settings') && !user) {
		log('accès anonyme aux paramètres → /auth/login');
		throw redirect(302, '/auth/login');
	}

	return resolve(event);
};
