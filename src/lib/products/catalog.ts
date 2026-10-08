// -----------------------------------------------------------------------------
// Lecture publique du catalogue.
//
// Ces fonctions sont le point d'entrée de la vitrine : elles ne servent jamais
// à muter un produit. Les écritures restent dans les DAO Prisma, derrière les
// gardes admin. Retirer le module, pour ce fichier-là, se résume à ne plus
// appeler ces lecteurs depuis les routes `/products`.
//
// Les filtres (« Catégorie », « Matière », ...) sont tous portés par le
// système générique de taxonomies (`$lib/prisma/taxonomies`) : chaque
// `Taxonomy.slug` devient un paramètre d'URL (`?categorie=`, `?matiere=`...),
// et ses `TaxonomyValue.value` les valeurs sélectionnables. Sélectionner un
// parent inclut ses descendants (hiérarchie).
// -----------------------------------------------------------------------------

import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server';
import { cached, getCacheVersion } from '$lib/server/cache';
import { getAllTaxonomiesWithValues } from '$lib/prisma/taxonomies/taxonomies';
import { resolveDescendantIds } from '$lib/prisma/taxonomies/taxonomyValues';
import { toNumber } from '$lib/server/decimal';

const publicProductInclude = {
	categories: {
		include: {
			category: true
		}
	},
	material: true,
	taxonomyValues: { include: { taxonomyValue: { include: { taxonomy: true } } } },
	variants: { orderBy: { position: 'asc' } }
} as const;

type PublicProductPayload = Prisma.ProductGetPayload<{ include: typeof publicProductInclude }>;

/** `price`/`compareAtPrice` (produit) et `price` (variante) sont des
 *  `Decimal` Prisma : convertis en `number` dès la lecture, jamais
 *  propagés tels quels (cf. RESTE_A_FAIRE.md §A.2.1). */
function mapPublicProduct(product: PublicProductPayload) {
	return {
		...product,
		price: toNumber(product.price),
		compareAtPrice: toNumber(product.compareAtPrice),
		variants: product.variants.map((variant) => ({ ...variant, price: toNumber(variant.price) }))
	};
}

export type PublicProduct = Awaited<ReturnType<typeof listProducts>>['products'][number];

// Lectures publiques fréquentes, écritures rares : mises en cache Redis 60 s
// (TTL court pour limiter le risque de données périmées). Un seul numéro de
// version pour tout le catalogue — bumpé par les DAO d'écriture de
// `$lib/prisma/products` et `$lib/prisma/taxonomies` — invalide en une seule
// opération produits et taxonomies, sans avoir à énumérer chaque clé filtrée.
const CACHE_NAMESPACE = 'catalog';
const CACHE_TTL_SECONDS = 60;
const PRODUCTS_PER_PAGE = 24;

async function catalogKey(name: string): Promise<string> {
	const version = await getCacheVersion(CACHE_NAMESPACE);
	return `${CACHE_NAMESPACE}:v${version}:${name}`;
}

type TaxonomiesWithValues = Awaited<ReturnType<typeof getAllTaxonomiesWithValues>>;

async function getCachedTaxonomiesWithValues(): Promise<TaxonomiesWithValues> {
	const key = await catalogKey('taxonomies-with-values');
	return cached(key, CACHE_TTL_SECONDS, () => getAllTaxonomiesWithValues());
}

/** Ids de la taxonomie `slug` correspondant aux `value` sélectionnées, descendants inclus. */
function resolveTaxonomyValueIds(
	taxonomies: TaxonomiesWithValues,
	slug: string,
	selectedValues: string[]
): string[] {
	const taxonomy = taxonomies.find((t) => t.slug === slug);
	if (!taxonomy) return [];

	const ids = new Set<string>();
	for (const match of taxonomy.values.filter((v) => selectedValues.includes(v.value))) {
		for (const id of resolveDescendantIds(taxonomy.values, match.id)) ids.add(id);
	}
	return [...ids];
}

export type ProductSort = 'pertinence' | 'prix-asc' | 'prix-desc' | 'nouveaute';

const SORT_ORDER_BY: Record<ProductSort, Prisma.ProductOrderByWithRelationInput> = {
	pertinence: { name: 'asc' },
	'prix-asc': { price: 'asc' },
	'prix-desc': { price: 'desc' },
	nouveaute: { createdAt: 'desc' }
};

export interface ListProductsOptions {
	page?: number;
	search?: string;
	/** Slug de taxonomie -> valeurs sélectionnées. OR dans une taxonomie, AND entre elles. */
	taxonomyFilters?: Record<string, string[]>;
	minPrice?: number;
	maxPrice?: number;
	inStockOnly?: boolean;
	sort?: ProductSort;
}

/**
 * `excludeSlug` retire le filtre de cette taxonomie du `where` — utilisé par
 * `getCatalogFacets` pour qu'une valeur cochée ne fasse pas disparaître les
 * autres valeurs de sa propre facette (seules les *autres* facettes + la
 * recherche réduisent l'ensemble affiché, comme la plupart des vitrines).
 */
async function buildWhere(
	{ search, taxonomyFilters, minPrice, maxPrice, inStockOnly }: ListProductsOptions,
	excludeSlug?: string
): Promise<Prisma.ProductWhereInput> {
	const normalizedSearch = search?.trim() || undefined;
	const taxonomies = await getCachedTaxonomiesWithValues();

	const taxonomyConditions: Prisma.ProductWhereInput[] = [];
	for (const [slug, values] of Object.entries(taxonomyFilters ?? {})) {
		if (slug === excludeSlug || !values?.length) continue;
		const valueIds = resolveTaxonomyValueIds(taxonomies, slug, values);
		if (valueIds.length === 0) continue;
		taxonomyConditions.push({ taxonomyValues: { some: { taxonomyValueId: { in: valueIds } } } });
	}

	return {
		...(normalizedSearch
			? {
					OR: [
						{ name: { contains: normalizedSearch, mode: 'insensitive' as const } },
						{ description: { contains: normalizedSearch, mode: 'insensitive' as const } }
					]
				}
			: {}),
		...(taxonomyConditions.length ? { AND: taxonomyConditions } : {}),
		...(inStockOnly ? { stock: { gt: 0 } } : {}),
		...(minPrice !== undefined || maxPrice !== undefined
			? {
					price: {
						...(minPrice !== undefined ? { gte: minPrice } : {}),
						...(maxPrice !== undefined ? { lte: maxPrice } : {})
					}
				}
			: {})
	};
}

/**
 * Liste les produits selon les filtres combinables de la vitrine (taxonomies,
 * recherche texte, prix, disponibilité) et un tri — paginée
 * (`PRODUCTS_PER_PAGE` par page) pour ne jamais charger tout le catalogue en
 * mémoire. Chaque paramètre fait partie de la clé de cache : deux résultats
 * différents ne doivent jamais partager la même entrée.
 */
export async function listProducts(options: ListProductsOptions = {}) {
	const safePage = Math.max(1, Math.floor(options.page ?? 1));
	const sort = options.sort ?? 'pertinence';
	const where = await buildWhere(options);

	const key = await catalogKey(`products:${JSON.stringify({ ...options, page: safePage, sort })}`);
	return cached(key, CACHE_TTL_SECONDS, async () => {
		const [products, total] = await Promise.all([
			prisma.product.findMany({
				where,
				include: publicProductInclude,
				orderBy: SORT_ORDER_BY[sort],
				skip: (safePage - 1) * PRODUCTS_PER_PAGE,
				take: PRODUCTS_PER_PAGE
			}),
			prisma.product.count({ where })
		]);

		return {
			products: products.map(mapPublicProduct),
			total,
			page: safePage,
			perPage: PRODUCTS_PER_PAGE
		};
	});
}

export interface TaxonomyFacet {
	slug: string;
	name: string;
	type: string;
	values: { value: string; label: string; code: string | null; count: number }[];
}

export interface CatalogFacets {
	taxonomies: TaxonomyFacet[];
	priceBounds: { min: number; max: number };
}

/**
 * Options de filtre disponibles pour la recherche/les filtres courants — une
 * facette par taxonomie (valeurs présentes + comptage) et bornes de prix.
 */
export async function getCatalogFacets(
	taxonomyFilters?: Record<string, string[]>,
	search?: string
): Promise<CatalogFacets> {
	const key = await catalogKey(`facets:${JSON.stringify({ taxonomyFilters, search })}`);

	return cached(key, CACHE_TTL_SECONDS, async () => {
		const taxonomies = await getCachedTaxonomiesWithValues();

		const [taxonomyFacets, priceAgg] = await Promise.all([
			Promise.all(
				taxonomies.map(async (taxonomy) => {
					const where = await buildWhere({ search, taxonomyFilters }, taxonomy.slug);
					const rows = await prisma.taxonomyValue.findMany({
						where: { taxonomyId: taxonomy.id },
						select: {
							value: true,
							label: true,
							code: true,
							_count: { select: { products: { where: { product: where } } } }
						}
					});

					const values = rows
						.map((row) => ({
							value: row.value,
							label: row.label || row.value,
							code: row.code,
							count: row._count.products
						}))
						.filter((v) => v.count > 0)
						.sort((a, b) => b.count - a.count);

					return { slug: taxonomy.slug, name: taxonomy.name, type: taxonomy.type, values };
				})
			),
			prisma.product.aggregate({
				where: await buildWhere({ search, taxonomyFilters }),
				_min: { price: true },
				_max: { price: true }
			})
		]);

		return {
			taxonomies: taxonomyFacets.filter((t) => t.values.length > 0),
			priceBounds: {
				min: Math.floor(toNumber(priceAgg._min.price) ?? 0),
				max: Math.ceil(toNumber(priceAgg._max.price) ?? 0)
			}
		};
	});
}

/** Fiche produit par slug, ou `null` si inconnu. */
export async function getProductBySlug(slug: string) {
	const key = await catalogKey(`product:${slug}`);
	return cached(key, CACHE_TTL_SECONDS, async () => {
		const product = await prisma.product.findUnique({
			where: { slug },
			include: publicProductInclude
		});
		return product ? mapPublicProduct(product) : null;
	});
}

const RELATED_PRODUCTS_LIMIT = 4;

/**
 * Produits « vous aimerez aussi » — même(s) catégorie(s), le produit courant
 * exclu. Module activable côté vitrine (`StoreSettings.crossSellEnabled`) ;
 * cette fonction reste appelable indépendamment du flag, la vérification est
 * de la responsabilité de la route.
 */
export async function getRelatedProducts(productId: string, categoryIds: string[]) {
	if (categoryIds.length === 0) return [];

	const key = await catalogKey(`related:${productId}:${categoryIds.slice().sort().join(',')}`);
	return cached(key, CACHE_TTL_SECONDS, async () => {
		const products = await prisma.product.findMany({
			where: {
				id: { not: productId },
				categories: { some: { categoryId: { in: categoryIds } } }
			},
			include: publicProductInclude,
			orderBy: { createdAt: 'desc' },
			take: RELATED_PRODUCTS_LIMIT
		});
		return products.map(mapPublicProduct);
	});
}
