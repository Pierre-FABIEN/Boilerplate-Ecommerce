import * as Sentry from '@sentry/sveltekit';
import { getRedis, isRedisConfigured } from './redis';
import { log } from './log';

/** Fallback en mémoire (process unique) quand Redis n'est pas configuré. */
const memoryWindows = new Map<string, { count: number; windowStart: number }>();

/**
 * Signale un évènement qui, répété au-delà d'un seuil dans une fenêtre
 * glissante, mérite une alerte (log `ERROR` + Sentry) — jamais à chaque
 * occurrence, ce qui noierait le signal sous du bruit. Une seule alerte est
 * envoyée par fenêtre : le compteur Redis expire (`windowSeconds`) puis
 * repart de zéro, donc une dégradation qui persiste réalerte à la fenêtre
 * suivante plutôt qu'en continu.
 *
 * Utilisé pour les signaux directement liés à la charge (5xx en hausse,
 * contention de verrou répétée) — pas un remplacement d'un vrai outil
 * d'alerting (PagerDuty/Slack), mais ce que Sentry peut exploiter sans
 * infrastructure supplémentaire : configurer une règle d'alerte Sentry sur
 * le tag `alert:<key>` pour être notifié en dehors du dashboard.
 *
 * Renvoie `true` seulement pour l'appel qui fait franchir le seuil — permet
 * à un appelant de déclencher un effet de bord qui, comme l'alerte Sentry
 * elle-même, ne doit se produire qu'une fois par fenêtre (voir
 * `$lib/server/failedLoginAlert.ts`, qui en dépend pour l'e-mail « plusieurs
 * tentatives de connexion échouées »).
 */
export async function reportIfRepeated(
	key: string,
	options: { threshold: number; windowSeconds: number; message: string }
): Promise<boolean> {
	const { threshold, windowSeconds, message } = options;
	let count: number;

	if (isRedisConfigured()) {
		const redis = getRedis();
		const redisKey = `alert-window:${key}`;
		count = await redis.incr(redisKey);
		if (count === 1) {
			await redis.expire(redisKey, windowSeconds);
		}
	} else {
		const now = Date.now();
		const existing = memoryWindows.get(key);
		if (!existing || now - existing.windowStart > windowSeconds * 1000) {
			memoryWindows.set(key, { count: 1, windowStart: now });
			count = 1;
		} else {
			existing.count += 1;
			count = existing.count;
		}
	}

	if (count === threshold) {
		log('ERROR', 'Alerting', message, { key, threshold, windowSeconds });
		Sentry.captureMessage(message, { level: 'warning', tags: { alert: key } });
		return true;
	}
	return false;
}
