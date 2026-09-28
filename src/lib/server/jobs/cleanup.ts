import { prisma } from '$lib/server';
import { recordDuration } from '$lib/server/metrics';

/**
 * Purge périodique des lignes qui n'ont plus de valeur passé leur expiration.
 *
 * Ce qui est purgé (aucune obligation de conservation) :
 * - `sessions`, `email_verification_requests`, `password_reset_sessions`
 *   expirées : jusqu'ici supprimées seulement au coup par coup, à la prochaine
 *   lecture du même token (`validateSessionToken`, etc.) — une session jamais
 *   revisitée restait en base indéfiniment.
 * - `orders` PENDING abandonnées depuis plus de `ABANDONED_ORDER_DAYS` : un
 *   panier jamais payé (`OrderItem`/`Custom` cascadent avec l'`Order`). Le
 *   filtre porte sur `updatedAt`, pas `createdAt` : un panier alimenté
 *   progressivement sur plusieurs mois reste `updatedAt` récent et ne doit
 *   jamais être purgé, même s'il a été créé il y a longtemps.
 *
 * Ce qui n'est JAMAIS purgé : `transactions` (écriture comptable permanente,
 * voir `docs/commerce/README.md`) ni les `orders` déjà `PAID`/`SHIPPED`.
 *
 * `login_events` (historique des connexions, voir
 * `$lib/prisma/loginEvent/loginEvent.ts`) suit une règle différente : ce
 * n'est pas une donnée expirée à nettoyer mais un journal de sécurité, purgé
 * seulement au bout de `LOGIN_EVENT_RETENTION_DAYS` — assez long pour que
 * « déjà vu cet appareil il y a quelques mois » reste une information utile,
 * pas indéfiniment (minimisation, RGPD art. 5.1.e).
 *
 * Chaque exécution est journalisée (comptes + durée), succès ou échec : cette
 * route n'a pas d'autre lecteur que les logs (le cron ne relit jamais la
 * réponse HTTP), donc c'est la seule trace exploitable en cas d'incident.
 */

const ABANDONED_ORDER_DAYS = 30;
const LOGIN_EVENT_RETENTION_DAYS = 90;

export interface CleanupResult {
	expiredSessions: number;
	expiredEmailVerificationRequests: number;
	expiredPasswordResetSessions: number;
	abandonedPendingOrders: number;
	oldLoginEvents: number;
	durationMs: number;
}

export async function runCleanupJob(): Promise<CleanupResult> {
	const startedAt = Date.now();
	const now = new Date();
	const abandonedBefore = new Date(now.getTime() - ABANDONED_ORDER_DAYS * 24 * 60 * 60 * 1000);
	const loginEventsBefore = new Date(
		now.getTime() - LOGIN_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
	);

	try {
		const [
			expiredSessions,
			expiredEmailVerificationRequests,
			expiredPasswordResetSessions,
			oldLoginEvents
		] = await Promise.all([
			prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
			prisma.emailVerificationRequest.deleteMany({ where: { expiresAt: { lt: now } } }),
			prisma.passwordResetSession.deleteMany({ where: { expiresAt: { lt: now } } }),
			prisma.loginEvent.deleteMany({ where: { createdAt: { lt: loginEventsBefore } } })
		]);

		// Séparé du `Promise.all` ci-dessus : cible `orders`/`order_items`, pas les
		// tables d'auth, pas de raison de les faire échouer ensemble.
		const abandonedPendingOrders = await prisma.order.deleteMany({
			where: { status: 'PENDING', updatedAt: { lt: abandonedBefore } }
		});

		const result: CleanupResult = {
			expiredSessions: expiredSessions.count,
			oldLoginEvents: oldLoginEvents.count,
			expiredEmailVerificationRequests: expiredEmailVerificationRequests.count,
			expiredPasswordResetSessions: expiredPasswordResetSessions.count,
			abandonedPendingOrders: abandonedPendingOrders.count,
			durationMs: Date.now() - startedAt
		};

		console.log('[cleanup] purge terminée', result);
		await recordDuration('job.cleanup', result.durationMs);
		return result;
	} catch (error) {
		console.error('[cleanup] échec de la purge', {
			durationMs: Date.now() - startedAt,
			error
		});
		throw error;
	}
}
