/**
 * Taux de TVA du catalogue (`StoreSettings.vatRate`, ligne unique
 * `id = "singleton"`, même ligne que `$lib/server/storeSettings.ts`) —
 * remplace l'ancienne constante `TVA_RATE` figée à 5,5 % (taux réduit,
 * incorrect pour de la bijouterie qui relève du taux normal en France,
 * voir `RESTE_A_FAIRE.md`). Fichier séparé de `storeSettings.ts`
 * car `StoreFeatureFlags` est typé tout-booléen — ce champ est un nombre.
 *
 * Même cache courte durée que `getStoreFeatureFlags` : ce taux est lu sur
 * quasi toutes les pages vitrine (calcul TTC affiché).
 */
import { prisma } from '$lib/server';
import { cached, bumpCacheVersion, getCacheVersion } from '$lib/server/cache';

const CACHE_NAMESPACE = 'settings';
const CACHE_TTL_SECONDS = 30;
const SINGLETON_ID = 'singleton';

/** Repli si la ligne `StoreSettings` n'existe pas encore (jamais censé arriver en prod). */
const DEFAULT_VAT_RATE = 0.055;

export async function getVatRate(): Promise<number> {
	const version = await getCacheVersion(CACHE_NAMESPACE);
	const key = `${CACHE_NAMESPACE}:v${version}:vatRate`;
	return cached(key, CACHE_TTL_SECONDS, async () => {
		const row = await prisma.storeSettings.findUnique({ where: { id: SINGLETON_ID } });
		return row?.vatRate ?? DEFAULT_VAT_RATE;
	});
}

export async function updateVatRate(rate: number): Promise<number> {
	const row = await prisma.storeSettings.update({
		where: { id: SINGLETON_ID },
		data: { vatRate: rate }
	});
	await bumpCacheVersion(CACHE_NAMESPACE);
	return row.vatRate;
}
