import { getRedis, isRedisConfigured } from './redis';

/**
 * Cache-aside générique : lit `key` sur Redis, sinon appelle `fn()` et écrit
 * le résultat avec un TTL. Sans Redis configuré (dev local), appelle
 * directement `fn()` — aucun comportement cassé, juste pas de cache.
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
	if (!isRedisConfigured()) {
		return fn();
	}

	const redis = getRedis();
	const hit = await redis.get<T>(key);
	if (hit !== null && hit !== undefined) {
		return hit;
	}

	const value = await fn();
	await redis.set(key, value, { ex: ttlSeconds });
	return value;
}

/**
 * Version d'un namespace de cache, pour invalider en masse sans connaître
 * à l'avance toutes les clés concernées (ex: un même produit peut apparaître
 * dans plusieurs listes filtrées par catégorie). Bumper la version rend les
 * anciennes clés orphelines — elles expirent seules via leur TTL, jamais relues.
 */
export async function getCacheVersion(namespace: string): Promise<number> {
	if (!isRedisConfigured()) {
		return 0;
	}
	const value = await getRedis().get<number>(`${namespace}:version`);
	return value ?? 0;
}

export async function bumpCacheVersion(namespace: string): Promise<void> {
	if (!isRedisConfigured()) {
		return;
	}
	await getRedis().incr(`${namespace}:version`);
}
