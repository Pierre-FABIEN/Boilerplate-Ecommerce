// -----------------------------------------------------------------------------
// hooks.server.ts — composition des middlewares serveur.
//
// Ce fichier ne contient que de l'assemblage : chaque préoccupation vit dans son
// propre module. L'authentification est fournie par `authHandle`
// (`src/lib/lucia/hooks.ts`) et constitue le seul point de raccordement de
// l'auth au cycle de requête.
//
// Ordre de la chaîne (voir `handle` en bas de fichier) :
//   devtoolsGuard → cookieGuard → rateLimit → authHandle → adminHandle → pendingOrderHandle
// -----------------------------------------------------------------------------

import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { RefillingTokenBucket } from '$lib/server/rate-limit';
import { createPendingOrder, findPendingOrder } from '$lib/prisma/order/prendingOrder';

// AUTH-PLUGIN ▼ retirer cet import et `authHandle` de la séquence finale.
import { authHandle } from '$lib/lucia/hooks';
// AUTH-PLUGIN ▲

// ADMIN-PLUGIN ▼ retirer cet import et `adminHandle` de la séquence finale.
import { adminHandle } from '$lib/admin/hooks';
// ADMIN-PLUGIN ▲

/** Passe à `true` pour tracer les gardes globales dans la console. */
const DEBUG = false;

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, context: string, ...args: unknown[]) {
	if (!DEBUG && level === 'DEBUG') return;

	const prefix = `[${new Date().toISOString()}] [${level}] [${context}]`;
	if (level === 'ERROR') console.error(prefix, ...args);
	else if (level === 'WARN') console.warn(prefix, ...args);
	else if (level === 'INFO') console.info(prefix, ...args);
	else console.debug(prefix, ...args);
}

/** Adresse du client, en tenant compte d'un éventuel proxy (Vercel). */
function clientIP(event: Parameters<Handle>[0]['event']): string {
	const xff = event.request.headers.get('x-forwarded-for');
	if (xff) return xff.split(',')[0]!.trim();
	try {
		return event.getClientAddress();
	} catch {
		return '127.0.0.1';
	}
}

/* -------------------------------------------------------------------------- */
/*  Gardes globales (indépendantes de l'authentification)                     */
/* -------------------------------------------------------------------------- */

/** Coupe court aux sondes de Chrome DevTools, qui polluent les logs. */
const devtoolsGuard: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/.well-known/appspecific/')) {
		log('INFO', 'DevTools', 'Requête DevTools ignorée');
		return new Response(null, { status: 204 });
	}
	return resolve(event);
};

/** Rejette les en-têtes `cookie` non ASCII, que le parseur refuserait plus loin. */
const cookieGuard: Handle = async ({ event, resolve }) => {
	const cookie = event.request.headers.get('cookie') ?? '';
	if (/[^\u0020-\u007E]/.test(cookie)) {
		log('WARN', 'CookieGuard', 'Caractères invalides dans le cookie');
		return new Response('Bad Cookie', { status: 400 });
	}
	return resolve(event);
};

/** Plafond brut par IP : 100 requêtes par seconde. */
const bucket = new RefillingTokenBucket<string>(100, 1);

const rateLimit: Handle = async ({ event, resolve }) => {
	const ip = clientIP(event);
	if (!bucket.consume(ip, 1)) {
		log('WARN', 'RateLimit', 'Quota dépassé pour', ip);
		return new Response('Too many requests', { status: 429 });
	}
	return resolve(event);
};

/* -------------------------------------------------------------------------- */
/*  Panier serveur (commerce)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Attache au visiteur connecté sa commande en cours, en la créant au besoin.
 *
 * AUTH-PLUGIN : dépend de `locals.user`. Sans authentification, il faut soit
 * supprimer ce hook (panier purement client), soit rattacher la commande à un
 * identifiant de visiteur anonyme stocké en cookie.
 *
 * Ce n'est pas PRODUCT-PLUGIN : le catalogue n'a pas de hook. `pendingOrder`
 * appartient au futur module commerce (panier / checkout).
 */
const pendingOrderHandle: Handle = async ({ event, resolve }) => {
	const userId = event.locals.user?.id;

	if (userId) {
		try {
			event.locals.pendingOrder =
				(await findPendingOrder(userId)) ?? (await createPendingOrder(userId));
		} catch (error) {
			log('ERROR', 'PendingOrder', 'Récupération impossible', error);
			event.locals.pendingOrder = null;
		}
	} else {
		event.locals.pendingOrder = null;
	}

	return resolve(event);
};

/* -------------------------------------------------------------------------- */
/*  Chaîne finale                                                             */
/* -------------------------------------------------------------------------- */

export const handle: Handle = sequence(
	devtoolsGuard,
	cookieGuard,
	rateLimit,
	// AUTH-PLUGIN ▼ retirer cette ligne pour désactiver l'authentification.
	authHandle,
	// AUTH-PLUGIN ▲
	// ADMIN-PLUGIN ▼ retirer cette ligne pour désactiver l'administration.
	// Doit rester après `authHandle` : il lit `locals.user` / `locals.role`.
	adminHandle,
	// ADMIN-PLUGIN ▲
	pendingOrderHandle
);
