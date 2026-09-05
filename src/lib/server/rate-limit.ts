/**
 * Compteurs de limitation de débit.
 *
 * Ces classes ne dépendent de rien : elles servent au hook global
 * (`src/hooks.server.ts`), au formulaire de contact et aux routes
 * d'authentification. Elles vivent donc hors du module d'auth, pour que son
 * retrait ne prive pas le reste du projet de ses limiteurs.
 *
 * Deux implémentations coexistent, choisies au premier appel via
 * `isRedisConfigured()` :
 * - Redis (Upstash) configuré : chaque algorithme tourne dans un script Lua
 *   (`redis.eval`), un seul aller-retour réseau et atomique — nécessaire en
 *   déploiement multi-instances (Vercel serverless), où un état en mémoire de
 *   process ne serait pas partagé entre instances.
 * - Redis absent (dev local sans compte Upstash) : repli sur une `Map` en
 *   mémoire, pour ne pas exiger de configuration supplémentaire en local.
 *
 * - `RefillingTokenBucket` : se recharge d'un jeton par intervalle.
 * - `ExpiringTokenBucket` : quota fixe sur une fenêtre, remis à zéro à l'expiration.
 * - `Throttler` : impose un délai croissant entre tentatives (échecs de connexion).
 * - `TokenBucket` : variante de `RefillingTokenBucket`, non utilisée dans le
 *   projet — conservée en mémoire uniquement, pas de version Redis.
 */

import type { RequestEvent } from '@sveltejs/kit';
import { getRedis, isRedisConfigured } from './redis';

function redisKey(namespace: string, key: unknown): string {
	return `${namespace}:${String(key)}`;
}

function newNamespace(prefix: string): string {
	return `rl:${prefix}:${crypto.randomUUID()}`;
}

/* -------------------------------------------------------------------------- */
/*  Scripts Lua — un aller-retour réseau, atomique                            */
/* -------------------------------------------------------------------------- */

// ARGV: [max, refillIntervalSeconds, cost, now]
const REFILLING_CHECK = `
local data = redis.call('HMGET', KEYS[1], 'count', 'refilledAt')
if data[1] == false then return 1 end
local max = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local count = tonumber(data[1])
local refilledAt = tonumber(data[2])
local refill = math.floor((now - refilledAt) / (interval * 1000))
if refill > 0 then
  count = math.min(count + refill, max)
end
if count >= cost then return 1 else return 0 end
`;

const REFILLING_CONSUME = `
local max = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local ttlMs = interval * 2000

local data = redis.call('HMGET', KEYS[1], 'count', 'refilledAt')
if data[1] == false then
  redis.call('HMSET', KEYS[1], 'count', max - cost, 'refilledAt', now)
  redis.call('PEXPIRE', KEYS[1], ttlMs)
  return 1
end

local count = tonumber(data[1])
local refilledAt = tonumber(data[2])
local refill = math.floor((now - refilledAt) / (interval * 1000))
count = math.min(count + refill, max)
refilledAt = now

if count < cost then
  redis.call('HMSET', KEYS[1], 'count', count, 'refilledAt', refilledAt)
  redis.call('PEXPIRE', KEYS[1], ttlMs)
  return 0
end

count = count - cost
redis.call('HMSET', KEYS[1], 'count', count, 'refilledAt', refilledAt)
redis.call('PEXPIRE', KEYS[1], ttlMs)
return 1
`;

// ARGV: [timeoutSecondsJSON, now]
const THROTTLER_CONSUME = `
local timeouts = cjson.decode(ARGV[1])
local now = tonumber(ARGV[2])
local n = #timeouts

local data = redis.call('HMGET', KEYS[1], 'timeout', 'updatedAt')
if data[1] == false then
  redis.call('HMSET', KEYS[1], 'timeout', 0, 'updatedAt', now)
  redis.call('PEXPIRE', KEYS[1], (timeouts[n] + 1) * 1000)
  return 1
end

local timeout = tonumber(data[1])
local updatedAt = tonumber(data[2])
local waitSeconds = timeouts[timeout + 1]
if (now - updatedAt) < (waitSeconds * 1000) then
  return 0
end

local newTimeout = math.min(timeout + 1, n - 1)
redis.call('HMSET', KEYS[1], 'timeout', newTimeout, 'updatedAt', now)
redis.call('PEXPIRE', KEYS[1], (timeouts[n] + 1) * 1000)
return 1
`;

// ARGV: [max, expiresInSeconds, cost, now]
const EXPIRING_CHECK = `
local expiresSeconds = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local data = redis.call('HMGET', KEYS[1], 'count', 'createdAt')
if data[1] == false then return 1 end

local createdAt = tonumber(data[2])
if (now - createdAt) >= (expiresSeconds * 1000) then return 1 end

local count = tonumber(data[1])
if count >= cost then return 1 else return 0 end
`;

const EXPIRING_CONSUME = `
local max = tonumber(ARGV[1])
local expiresSeconds = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local ttlMs = expiresSeconds * 1000

local data = redis.call('HMGET', KEYS[1], 'count', 'createdAt')
if data[1] == false then
  redis.call('HMSET', KEYS[1], 'count', max - cost, 'createdAt', now)
  redis.call('PEXPIRE', KEYS[1], ttlMs)
  return 1
end

local count = tonumber(data[1])
local createdAt = tonumber(data[2])

if (now - createdAt) >= ttlMs then
  count = max
  createdAt = now
end

if count < cost then
  redis.call('HMSET', KEYS[1], 'count', count, 'createdAt', createdAt)
  redis.call('PEXPIRE', KEYS[1], ttlMs)
  return 0
end

count = count - cost
redis.call('HMSET', KEYS[1], 'count', count, 'createdAt', createdAt)
redis.call('PEXPIRE', KEYS[1], ttlMs)
return 1
`;

async function evalScript(
	script: string,
	keys: string[],
	args: (string | number)[]
): Promise<number> {
	const result = await getRedis().eval(script, keys, args);
	return Number(result);
}

/* -------------------------------------------------------------------------- */
/*  RefillingTokenBucket                                                     */
/* -------------------------------------------------------------------------- */

export class RefillingTokenBucket<_Key> {
	public max: number;
	public refillIntervalSeconds: number;

	private namespace = newNamespace('refill');
	private storage = new Map<_Key, RefillBucket>();

	constructor(max: number, refillIntervalSeconds: number) {
		this.max = max;
		this.refillIntervalSeconds = refillIntervalSeconds;
	}

	public async check(key: _Key, cost: number): Promise<boolean> {
		if (isRedisConfigured()) {
			const allowed = await evalScript(
				REFILLING_CHECK,
				[redisKey(this.namespace, key)],
				[this.max, this.refillIntervalSeconds, cost, Date.now()]
			);
			return allowed === 1;
		}

		const bucket = this.storage.get(key) ?? null;
		if (bucket === null) {
			return true;
		}
		const now = Date.now();
		const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
		if (refill > 0) {
			return Math.min(bucket.count + refill, this.max) >= cost;
		}
		return bucket.count >= cost;
	}

	public async consume(key: _Key, cost: number): Promise<boolean> {
		if (isRedisConfigured()) {
			const allowed = await evalScript(
				REFILLING_CONSUME,
				[redisKey(this.namespace, key)],
				[this.max, this.refillIntervalSeconds, cost, Date.now()]
			);
			return allowed === 1;
		}

		let bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			bucket = {
				count: this.max - cost,
				refilledAt: now
			};
			this.storage.set(key, bucket);
			return true;
		}
		const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
		bucket.count = Math.min(bucket.count + refill, this.max);
		bucket.refilledAt = now;
		if (bucket.count < cost) {
			return false;
		}
		bucket.count -= cost;
		this.storage.set(key, bucket);
		return true;
	}
}

/* -------------------------------------------------------------------------- */
/*  Throttler                                                                */
/* -------------------------------------------------------------------------- */

export class Throttler<_Key> {
	public timeoutSeconds: number[];

	private namespace = newNamespace('throttle');
	private storage = new Map<_Key, ThrottlingCounter>();

	constructor(timeoutSeconds: number[]) {
		this.timeoutSeconds = timeoutSeconds;
	}

	public async consume(key: _Key): Promise<boolean> {
		if (isRedisConfigured()) {
			const allowed = await evalScript(
				THROTTLER_CONSUME,
				[redisKey(this.namespace, key)],
				[JSON.stringify(this.timeoutSeconds), Date.now()]
			);
			return allowed === 1;
		}

		let counter = this.storage.get(key) ?? null;
		const now = Date.now();
		if (counter === null) {
			counter = {
				timeout: 0,
				updatedAt: now
			};
			this.storage.set(key, counter);
			return true;
		}
		const allowed = now - counter.updatedAt >= this.timeoutSeconds[counter.timeout] * 1000;
		if (!allowed) {
			return false;
		}
		counter.updatedAt = now;
		counter.timeout = Math.min(counter.timeout + 1, this.timeoutSeconds.length - 1);
		this.storage.set(key, counter);
		return true;
	}

	public async reset(key: _Key): Promise<void> {
		if (isRedisConfigured()) {
			await getRedis().del(redisKey(this.namespace, key));
			return;
		}
		this.storage.delete(key);
	}
}

/* -------------------------------------------------------------------------- */
/*  ExpiringTokenBucket                                                      */
/* -------------------------------------------------------------------------- */

export class ExpiringTokenBucket<_Key> {
	public max: number;
	public expiresInSeconds: number;

	private namespace = newNamespace('expiring');
	private storage = new Map<_Key, ExpiringBucket>();

	constructor(max: number, expiresInSeconds: number) {
		this.max = max;
		this.expiresInSeconds = expiresInSeconds;
	}

	public async check(key: _Key, cost: number): Promise<boolean> {
		if (isRedisConfigured()) {
			const allowed = await evalScript(
				EXPIRING_CHECK,
				[redisKey(this.namespace, key)],
				[this.max, this.expiresInSeconds, cost, Date.now()]
			);
			return allowed === 1;
		}

		const bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			return true;
		}
		if (now - bucket.createdAt >= this.expiresInSeconds * 1000) {
			return true;
		}
		return bucket.count >= cost;
	}

	public async consume(key: _Key, cost: number): Promise<boolean> {
		if (isRedisConfigured()) {
			const allowed = await evalScript(
				EXPIRING_CONSUME,
				[redisKey(this.namespace, key)],
				[this.max, this.expiresInSeconds, cost, Date.now()]
			);
			return allowed === 1;
		}

		let bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			bucket = {
				count: this.max - cost,
				createdAt: now
			};
			this.storage.set(key, bucket);
			return true;
		}
		if (now - bucket.createdAt >= this.expiresInSeconds * 1000) {
			// Fenêtre expirée : on relance le compteur au max ET on redémarre son
			// horloge. Sans ce second reset, `createdAt` ne bougeant plus, la
			// condition resterait vraie indéfiniment et le quota ne limiterait
			// plus jamais rien après sa première expiration.
			bucket.count = this.max;
			bucket.createdAt = now;
		}
		if (bucket.count < cost) {
			return false;
		}
		bucket.count -= cost;
		this.storage.set(key, bucket);
		return true;
	}

	public async reset(key: _Key): Promise<void> {
		if (isRedisConfigured()) {
			await getRedis().del(redisKey(this.namespace, key));
			return;
		}
		this.storage.delete(key);
	}
}

/* -------------------------------------------------------------------------- */
/*  TokenBucket — non utilisé dans le projet, mémoire uniquement             */
/* -------------------------------------------------------------------------- */

export class TokenBucket<_Key> {
	public max: number;
	public refillIntervalSeconds: number;

	constructor(max: number, refillIntervalSeconds: number) {
		this.max = max;
		this.refillIntervalSeconds = refillIntervalSeconds;
	}

	private storage = new Map<_Key, Bucket>();

	public check(key: _Key, cost: number): boolean {
		const bucket = this.storage.get(key) ?? null;
		if (bucket === null) {
			return true;
		}
		const now = Date.now();
		const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
		if (refill > 0) {
			return Math.min(bucket.count + refill, this.max) >= cost;
		}
		return bucket.count >= cost;
	}

	public consume(key: _Key, cost: number): boolean {
		let bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			bucket = {
				count: this.max - cost,
				refilledAt: now
			};
			this.storage.set(key, bucket);
			return true;
		}
		const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
		if (refill > 0) {
			bucket.count = Math.min(bucket.count + refill, this.max);
			bucket.refilledAt = now;
		}
		if (bucket.count < cost) {
			this.storage.set(key, bucket);
			return false;
		}
		bucket.count -= cost;
		this.storage.set(key, bucket);
		return true;
	}
}

interface Bucket {
	count: number;
	refilledAt: number;
}

interface RefillBucket {
	count: number;
	refilledAt: number;
}

interface ExpiringBucket {
	count: number;
	createdAt: number;
}

interface ThrottlingCounter {
	timeout: number;
	updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Formulaire de contact — fusionné depuis l'ancien rate-limiter.ts          */
/* -------------------------------------------------------------------------- */

/**
 * Extrait l'adresse IP du client à partir de la requête.
 * Prend en compte le header `x-forwarded-for` pour les déploiements derrière un proxy.
 */
export function getClientIP(event: RequestEvent): string {
	const xff = event.request.headers.get('x-forwarded-for');
	if (xff && typeof xff === 'string') {
		return xff.split(',')[0].trim();
	}
	try {
		return event.getClientAddress();
	} catch {
		// Peut échouer dans certains environnements (ex: pré-rendu)
		return '127.0.0.1';
	}
}

/**
 * Limiteur de débit pour le formulaire de contact.
 *
 * CONTACT-PLUGIN : 5 envois valides d'affilée par IP, puis 1 jeton toutes
 * les 60 s. Le quota n'est consommé que si Zod a accepté le formulaire.
 */
export const contactFormLimiter = new RefillingTokenBucket<string>(5, 60);
