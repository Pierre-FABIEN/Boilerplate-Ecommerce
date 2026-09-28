// -----------------------------------------------------------------------------
// hooks.server.ts — composition des middlewares serveur.
//
// Ce fichier ne contient que de l'assemblage : chaque préoccupation vit dans son
// propre module. L'authentification est fournie par `authHandle`
// (`src/lib/lucia/hooks.ts`) et constitue le seul point de raccordement de
// l'auth au cycle de requête.
//
// Ordre de la chaîne (voir `handle` en bas de fichier) :
//   securityHeaders → errorRateTracking → devtoolsGuard → cookieGuard → rateLimit → catalogAntiScraping → authHandle → adminHandle → pendingOrderHandle
//
// CSRF : aucune configuration `csrf` dans `svelte.config.js` → la protection
// par défaut de SvelteKit (`checkOrigin`, qui bloque les requêtes de type
// formulaire — multipart/form-data, x-www-form-urlencoded, text/plain — dont
// l'origine ne correspond pas) est active, vérifié explicitement (pas juste
// supposé). Les 6 routes `/api/*` custom ont chacune leur propre garde :
// `webhooks`/`jobs/post-payment` vérifient une signature (Stripe/QStash),
// `save-cart` exige une session authentifiée, et `promo/validate`,
// `address-search`, `sendcloud/*` sont des lectures/validations JSON sans
// effet de bord — aucune n'accepte de mutation via un `<form>` HTML classique.
// -----------------------------------------------------------------------------

import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { isValidSentryDsn } from '$lib/sentryDsn';

import { RefillingTokenBucket } from '$lib/server/rate-limit';
import { isSuspiciousUserAgent } from '$lib/server/anti-scraping';
import { incrementMetric } from '$lib/server/metrics';
import { reportIfRepeated } from '$lib/server/alerting';
import { createPendingOrder, findPendingOrder } from '$lib/prisma/order/prendingOrder';
import { log, withRequestId } from '$lib/server/log';
import { randomUUID } from 'crypto';

// AUTH-PLUGIN ▼ retirer cet import et `authHandle` de la séquence finale.
import { authHandle } from '$lib/lucia/hooks';
// AUTH-PLUGIN ▲

// ADMIN-PLUGIN ▼ retirer cet import et `adminHandle` de la séquence finale.
import { adminHandle } from '$lib/admin/hooks';
// ADMIN-PLUGIN ▲

/**
 * Suivi d'erreurs/traces (plan gratuit Sentry). Sans `SENTRY_DSN` ou avec
 * une valeur qui n'a pas la forme d'une DSN (`isValidSentryDsn`), le SDK
 * n'est jamais initialisé — aucune configuration supplémentaire requise en
 * local, même comportement que Redis/QStash absents ailleurs dans ce
 * fichier. Initialiser quand même avec une DSN invalide ne fait pas planter
 * l'appli mais imprime `Invalid Sentry Dsn: ****` à chaque requête —
 * évité en amont plutôt que subi.
 */
if (isValidSentryDsn(env.SENTRY_DSN)) {
	Sentry.init({
		dsn: env.SENTRY_DSN,
		tracesSampleRate: 0.1
	});
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

/**
 * Vrai pour une connexion TCP locale (tests de charge k6, scripts locaux),
 * jamais pour un vrai visiteur. Lit `event.getClientAddress()` directement —
 * PAS `clientIP()`, qui fait confiance à `X-Forwarded-For` (donc trivialement
 * falsifiable) : un `X-Forwarded-For: 127.0.0.1` envoyé par un vrai client
 * distant ne doit jamais lever le rate-limit. `getClientAddress()` reflète le
 * pair TCP réel — sur Vercel, jamais loopback pour du trafic externe.
 */
function isLoopbackPeer(event: Parameters<Handle>[0]['event']): boolean {
	try {
		const addr = event.getClientAddress();
		return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
	} catch {
		return false;
	}
}

/* -------------------------------------------------------------------------- */
/*  Gardes globales (indépendantes de l'authentification)                     */
/* -------------------------------------------------------------------------- */

/**
 * Ouvre le contexte de corrélation (`$lib/server/log.ts`) pour toute la durée
 * de la requête : réutilise `x-vercel-id` s'il existe (déjà unique bout-en-bout
 * côté Vercel) plutôt que d'en générer un second qui ne correspondrait à rien
 * dans les logs de la plateforme.
 */
const requestIdHandle: Handle = ({ event, resolve }) => {
	const requestId = event.request.headers.get('x-vercel-id') || randomUUID();
	return withRequestId(requestId, async () => {
		const response = await resolve(event);
		response.headers.set('x-request-id', requestId);
		return response;
	});
};

/**
 * En-têtes de sécurité posés sur toute réponse, quel que soit ce que font les
 * handles suivants. La CSP n'est pas ici : elle est posée nativement par
 * SvelteKit (`kit.csp` dans `svelte.config.js`), qui gère les hash/nonce de
 * ses propres scripts inline — la reproduire à la main ici casserait
 * l'hydratation.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	if (!dev) {
		// Uniquement en prod (HTTPS) : sur `localhost` en HTTP, un navigateur qui
		// respecte ce header rendrait le site inaccessible en dev.
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=63072000; includeSubDomains; preload'
		);
	}
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	return response;
};

/**
 * Observabilité des erreurs serveur : compteur visible sur `/admin/metrics`
 * (`http.5xx`) + alerte Sentry si le taux d'erreur devient anormal (20+ en 1
 * min). Ne remplace pas `handleError` (qui capture les exceptions non
 * attrapées) : celui-ci voit aussi les 5xx renvoyés volontairement (ex.
 * `error(500, ...)`) sans lever d'exception.
 */
const errorRateTracking: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	if (response.status >= 500) {
		await incrementMetric('http.5xx');
		await reportIfRepeated('http-5xx', {
			threshold: 20,
			windowSeconds: 60,
			message: 'Taux de réponses 5xx anormalement élevé (20+ en 1 min)'
		});
	}

	return response;
};

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
const bucket = new RefillingTokenBucket<string>(100, 1, 'global-ip');

const rateLimit: Handle = async ({ event, resolve }) => {
	if (isLoopbackPeer(event)) return resolve(event);

	const ip = clientIP(event);
	if (!(await bucket.consume(ip, 1))) {
		log('WARN', 'RateLimit', 'Quota dépassé pour', ip);
		return new Response('Too many requests', { status: 429 });
	}
	return resolve(event);
};

/**
 * Anti-scraping du catalogue public (`/products*`) : quota dédié, plus
 * strict que `global-ip` (un humain qui feuillette quelques fiches produit
 * ne l'atteint jamais), et rejet heuristique des clients HTTP scriptés
 * (`$lib/server/anti-scraping.ts`). Placé après `rateLimit` : le plafond
 * global s'applique déjà à tout, celui-ci vient resserrer spécifiquement le
 * catalogue.
 */
const catalogBucket = new RefillingTokenBucket<string>(40, 2, 'catalog-ip');

const catalogAntiScraping: Handle = async ({ event, resolve }) => {
	if (!event.url.pathname.startsWith('/products')) {
		return resolve(event);
	}
	if (isLoopbackPeer(event)) return resolve(event);

	if (isSuspiciousUserAgent(event.request.headers.get('user-agent'))) {
		log('WARN', 'AntiScraping', 'User-Agent suspect bloqué sur le catalogue', event.url.pathname);
		await incrementMetric('anti-scraping.blocked-ua');
		return new Response('Forbidden', { status: 403 });
	}

	const ip = clientIP(event);
	if (!(await catalogBucket.consume(ip, 1))) {
		log('WARN', 'AntiScraping', 'Quota catalogue dépassé pour', ip);
		await incrementMetric('anti-scraping.rate-limited');
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
 * COMMERCE-PLUGIN : le hook du tunnel. Ne voit que les commandes `PENDING`.
 * AUTH-PLUGIN : dépend de `locals.user`. Sans authentification, il faut soit
 * supprimer ce hook (panier purement client), soit rattacher la commande à un
 * identifiant de visiteur anonyme stocké en cookie.
 *
 * `/admin` (autre layout, jamais de panier affiché) et `/api` (aucune route
 * ne lit `locals.pendingOrder` — `checkout`/`save-cart` le rechargent eux-mêmes
 * si besoin) n'ont pas besoin de cette requête : évite un aller-retour DB avec
 * `include` lourd (items + produit + variante + custom) à chaque hit sur ces
 * chemins.
 */
const pendingOrderHandle: Handle = async ({ event, resolve }) => {
	const userId = event.locals.user?.id;
	const pathname = event.url.pathname;
	const needsPendingOrder =
		userId && !pathname.startsWith('/admin') && !pathname.startsWith('/api');

	if (needsPendingOrder) {
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
	Sentry.sentryHandle(),
	requestIdHandle,
	securityHeaders,
	errorRateTracking,
	devtoolsGuard,
	cookieGuard,
	rateLimit,
	catalogAntiScraping,
	// AUTH-PLUGIN ▼ retirer cette ligne pour désactiver l'authentification.
	authHandle,
	// AUTH-PLUGIN ▲
	// ADMIN-PLUGIN ▼ retirer cette ligne pour désactiver l'administration.
	// Doit rester après `authHandle` : il lit `locals.user` / `locals.role`.
	adminHandle,
	// ADMIN-PLUGIN ▲
	// COMMERCE-PLUGIN ▼ retirer cette ligne pour désactiver le panier serveur.
	pendingOrderHandle
	// COMMERCE-PLUGIN ▲
);

/**
 * Erreurs non attrapées côté serveur : déjà journalisées via `log()` (donc
 * corrélées au `requestId` de la requête), en plus remontées à Sentry
 * (no-op sans `SENTRY_DSN`).
 */
const reportUnhandledError: HandleServerError = ({ error, event }) => {
	log('ERROR', 'UnhandledError', `${event.route?.id ?? event.url.pathname}`, error);
};

export const handleError = Sentry.handleErrorWithSentry(reportUnhandledError);
