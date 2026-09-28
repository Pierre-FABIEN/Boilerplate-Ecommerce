// -----------------------------------------------------------------------------
// BUNDLE-PLUGIN : « Souvent achetés ensemble ».
//
// Pas de table dédiée : la co-occurrence se lit à la volée dans `OrderItem`
// (commandes payées/expédiées uniquement — jamais un panier abandonné). Deux
// usages :
//   - suggestion panier (`getFrequentlyBoughtTogether`), affichage seulement ;
//   - remise checkout (`computeBundleDiscount`), recalculée côté serveur au
//     moment du paiement, jamais une valeur transmise par le client (même
//     garde que `validatePromo`/le parrainage, voir `checkout/+page.server.ts`).
// -----------------------------------------------------------------------------
import { prisma } from '$lib/server';

/** Remise appliquée une seule fois (pas cumulée par paire) au checkout. */
export const BUNDLE_DISCOUNT_PERCENT = 0.1;

/** Nombre minimal de commandes distinctes en commun pour ne pas suggérer sur un unique achat coïncident. */
const MIN_CO_OCCURRENCE = 2;

const SUGGESTIONS_LIMIT = 3;

/** Statuts considérés comme une vente effective (jamais un panier PENDING/annulé). */
const COMPLETED_STATUSES = ['PAID', 'SHIPPED'] as const;

/** Compte, pour chaque autre produit, le nombre de commandes payées en commun avec `productId`. */
async function getCoOccurrenceCounts(productId: string): Promise<Map<string, number>> {
	const ordersWithProduct = await prisma.orderItem.findMany({
		where: { productId, order: { status: { in: [...COMPLETED_STATUSES] } } },
		select: { orderId: true }
	});
	const orderIds = ordersWithProduct.map((item) => item.orderId);
	if (orderIds.length === 0) return new Map();

	const grouped = await prisma.orderItem.groupBy({
		by: ['productId'],
		where: { orderId: { in: orderIds }, productId: { not: productId } },
		_count: { orderId: true }
	});

	return new Map(grouped.map((g) => [g.productId, g._count.orderId]));
}

/**
 * Produits fréquemment achetés avec `productId` — seuil `MIN_CO_OCCURRENCE`,
 * `excludeIds` retire ceux déjà présents dans le panier courant.
 */
export async function getFrequentlyBoughtTogether(
	productId: string,
	excludeIds: string[] = [],
	limit = SUGGESTIONS_LIMIT
) {
	const counts = await getCoOccurrenceCounts(productId);
	const excluded = new Set([productId, ...excludeIds]);

	const rankedIds = [...counts.entries()]
		.filter(([id, count]) => count >= MIN_CO_OCCURRENCE && !excluded.has(id))
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([id]) => id);

	if (rankedIds.length === 0) return [];

	const products = await prisma.product.findMany({
		where: { id: { in: rankedIds } },
		select: { id: true, name: true, slug: true, price: true, images: true, stock: true }
	});

	// `findMany({ where: { id: { in } } })` ne garantit pas l'ordre : reclasser
	// selon le rang de co-occurrence calculé ci-dessus.
	const byId = new Map(products.map((product) => [product.id, product]));
	return rankedIds
		.map((id) => byId.get(id))
		.filter((product): product is NonNullable<typeof product> => Boolean(product));
}

/**
 * Remise « souvent achetés ensemble » sur le total restant à payer —
 * déclenchée dès que deux produits du panier dépassent, entre eux, le seuil
 * de co-occurrence historique. Une seule remise par commande (pas cumulée si
 * plusieurs paires qualifient), pour rester une « petite remise » simple.
 */
export async function computeBundleDiscount(
	productIds: string[],
	remainder: number
): Promise<number> {
	const uniqueIds = [...new Set(productIds)];
	if (uniqueIds.length < 2 || remainder <= 0) return 0;

	// Une seule requête pour tout le panier, puis comptage des paires en
	// mémoire : boucler sur `getCoOccurrenceCounts` coûtait deux requêtes par
	// produit, sur un chemin appelé deux fois par passage en caisse (aperçu
	// dans le `load`, puis recalcul dans l'action).
	const rows = await prisma.orderItem.findMany({
		where: {
			productId: { in: uniqueIds },
			order: { status: { in: [...COMPLETED_STATUSES] } }
		},
		select: { orderId: true, productId: true }
	});

	const cartProductsByOrder = new Map<string, Set<string>>();
	for (const row of rows) {
		const seen = cartProductsByOrder.get(row.orderId);
		if (seen) seen.add(row.productId);
		else cartProductsByOrder.set(row.orderId, new Set([row.productId]));
	}

	// Compte des commandes DISTINCTES par paire, conformément à
	// `MIN_CO_OCCURRENCE` : deux lignes du même produit dans une même commande
	// ne valent qu'une co-occurrence.
	const ordersPerPair = new Map<string, number>();
	for (const products of cartProductsByOrder.values()) {
		if (products.size < 2) continue;
		const present = [...products].sort();
		for (let i = 0; i < present.length; i++) {
			for (let j = i + 1; j < present.length; j++) {
				const key = `${present[i]}|${present[j]}`;
				const count = (ordersPerPair.get(key) ?? 0) + 1;
				if (count >= MIN_CO_OCCURRENCE) {
					return parseFloat((remainder * BUNDLE_DISCOUNT_PERCENT).toFixed(2));
				}
				ordersPerPair.set(key, count);
			}
		}
	}

	return 0;
}
