import { getRedis, isRedisConfigured } from './redis';

// Ne supprime le verrou que s'il nous appartient encore : après expiration,
// une autre requête a pu déjà en poser un nouveau, qu'il ne faut pas effacer.
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

/**
 * Exécute `fn()` sous verrou distribué Redis (`SET key token NX PX ttl`).
 * Renvoie `null` sans exécuter `fn()` si le verrou est déjà pris par ailleurs
 * — utile contre les livraisons concurrentes d'un même webhook.
 *
 * Sans Redis configuré (dev local), exécute `fn()` directement : c'est alors
 * la seule garde applicative existante (ex: le `findUnique` avant écriture)
 * qui protège, comme avant l'introduction de ce module.
 */
export async function withLock<T>(
	key: string,
	ttlSeconds: number,
	fn: () => Promise<T>
): Promise<T | null> {
	if (!isRedisConfigured()) {
		return fn();
	}

	const redis = getRedis();
	const token = crypto.randomUUID();

	const acquired = await redis.set(key, token, { nx: true, px: ttlSeconds * 1000 });
	if (!acquired) {
		return null;
	}

	try {
		return await fn();
	} finally {
		await redis.eval(RELEASE_SCRIPT, [key], [token]);
	}
}
