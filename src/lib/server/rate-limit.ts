/**
 * Compteurs de limitation de débit, en mémoire du processus.
 *
 * Ces classes ne dépendent de rien : elles servent au hook global
 * (`src/hooks.server.ts`), au formulaire de contact et aux routes
 * d'authentification. Elles vivent donc hors du module d'auth, pour que son
 * retrait ne prive pas le reste du projet de ses limiteurs.
 *
 * Attention en déploiement multi-instances (Vercel serverless) : l'état n'est pas
 * partagé entre instances, chacune applique donc son propre quota. Pour une
 * limite globale il faudrait un stockage externe (Redis).
 *
 * - `RefillingTokenBucket` : se recharge d'un jeton par intervalle.
 * - `ExpiringTokenBucket` : quota fixe sur une fenêtre, remis à zéro à l'expiration.
 * - `Throttler` : impose un délai croissant entre tentatives (échecs de connexion).
 * - `TokenBucket` : variante de `RefillingTokenBucket` conservée pour compatibilité.
 */
export class RefillingTokenBucket<_Key> {
	public max: number;
	public refillIntervalSeconds: number;

	constructor(max: number, refillIntervalSeconds: number) {
		this.max = max;
		this.refillIntervalSeconds = refillIntervalSeconds;
	}

	private storage = new Map<_Key, RefillBucket>();

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

export class Throttler<_Key> {
	public timeoutSeconds: number[];

	private storage = new Map<_Key, ThrottlingCounter>();

	constructor(timeoutSeconds: number[]) {
		this.timeoutSeconds = timeoutSeconds;
	}

	public consume(key: _Key): boolean {
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

	public reset(key: _Key): void {
		this.storage.delete(key);
	}
}

export class ExpiringTokenBucket<_Key> {
	public max: number;
	public expiresInSeconds: number;

	private storage = new Map<_Key, ExpiringBucket>();

	constructor(max: number, expiresInSeconds: number) {
		this.max = max;
		this.expiresInSeconds = expiresInSeconds;
	}

	public check(key: _Key, cost: number): boolean {
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

	public consume(key: _Key, cost: number): boolean {
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
			bucket.count = this.max;
		}
		if (bucket.count < cost) {
			return false;
		}
		bucket.count -= cost;
		this.storage.set(key, bucket);
		return true;
	}

	public reset(key: _Key): void {
		this.storage.delete(key);
	}
}

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
