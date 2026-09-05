import { Redis } from '@upstash/redis';
import { dev } from '$app/environment';

/**
 * Client Upstash Redis (REST/HTTP, sans connexion persistante — compatible
 * avec les fonctions serverless Vercel).
 *
 * Optionnel en local : sans `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`,
 * `isRedisConfigured()` renvoie `false` et les modules appelants (rate-limit,
 * cache, lock) retombent sur un comportement en mémoire de process. En
 * production, sur plusieurs instances, ces variables sont nécessaires pour un
 * comportement correct (quotas partagés, cache partagé, verrous partagés).
 */

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function isRedisConfigured(): boolean {
	return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): Redis {
	if (!isRedisConfigured()) {
		throw new Error(
			'Redis non configuré : renseignez UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN, ou vérifiez isRedisConfigured() avant appel.'
		);
	}

	const redis =
		globalForRedis.redis ??
		new Redis({
			url: process.env.UPSTASH_REDIS_REST_URL!,
			token: process.env.UPSTASH_REDIS_REST_TOKEN!
		});

	if (dev) {
		globalForRedis.redis = redis;
	}

	return redis;
}
