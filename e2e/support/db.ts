import { PrismaClient, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { symmetricDecrypt } from 'better-auth/crypto';

/**
 * Client Prisma dédié aux tests, branché explicitement sur l'URL de `.env.test`
 * (schéma PostgreSQL `e2e`), afin de ne jamais toucher les données de dev.
 */
export const db = new PrismaClient({
	datasources: { db: { url: process.env.DATABASE_URL } },
	log: ['error']
});

/**
 * Conversion `Prisma.Decimal` → `number`, même sémantique que `toNumber()`
 * côté app (`src/lib/server/decimal.ts`) — dupliquée ici volontairement :
 * `e2e/support/**` n'importe jamais `#lib`. Les champs `@db.Decimal(10,2)`
 * (voir RESTE_A_FAIRE.md §A.2.1) remontent en `Prisma.Decimal` depuis une
 * lecture Prisma directe comme celles de ce fichier, qui ne passent jamais
 * par les mappers applicatifs (`mapOrder`/`mapProduct`/`mapTransaction`,
 * internes à `src/`) — sans cette conversion, une assertion e2e
 * `.toBe(42.5)`/`.toBeCloseTo(42.5)` échoue toujours face à l'objet.
 */
function toNumber(value: Prisma.Decimal | number): number;
function toNumber(value: Prisma.Decimal | number | null): number | null;
function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	return typeof value === 'number' ? value : value.toNumber();
}

/** `Order` a six champs `Decimal` — helper dédié pour ne pas répéter l'objet à chaque site. */
function mapOrderDecimals<
	T extends {
		subtotal: Prisma.Decimal;
		tax: Prisma.Decimal;
		total: Prisma.Decimal;
		discountAmount: Prisma.Decimal;
		giftCardAmount: Prisma.Decimal;
		shippingCost: Prisma.Decimal | null;
	}
>(order: T) {
	return {
		...order,
		subtotal: toNumber(order.subtotal),
		tax: toNumber(order.tax),
		total: toNumber(order.total),
		discountAmount: toNumber(order.discountAmount),
		giftCardAmount: toNumber(order.giftCardAmount),
		shippingCost: toNumber(order.shippingCost)
	};
}

/** `Transaction` a six champs `Decimal` — helper dédié, même logique que `mapOrderDecimals`. */
function mapTransactionDecimals<
	T extends {
		amount: Prisma.Decimal;
		disputeAmount: Prisma.Decimal | null;
		shippingCost: Prisma.Decimal;
		subtotalHt: Prisma.Decimal;
		taxAmount: Prisma.Decimal;
		discountAmount: Prisma.Decimal;
	}
>(transaction: T) {
	return {
		...transaction,
		amount: toNumber(transaction.amount),
		disputeAmount: toNumber(transaction.disputeAmount),
		shippingCost: toNumber(transaction.shippingCost),
		subtotalHt: toNumber(transaction.subtotalHt),
		taxAmount: toNumber(transaction.taxAmount),
		discountAmount: toNumber(transaction.discountAmount)
	};
}

/**
 * Schéma réellement utilisé par `DATABASE_URL` (`?schema=e2e` sur Neon,
 * absent → `public` sur la base éphémère de CI). Nécessaire pour qualifier
 * les tables dans le SQL brut (voir `backdateOrder`) : repli `public` requis
 * depuis que la CI tourne sur un Postgres jetable sans ce paramètre.
 * Identifiant validé (alphanumérique/underscore) avant interpolation SQL.
 */
const rawSchemaName = (() => {
	try {
		return new URL(process.env.DATABASE_URL ?? '').searchParams.get('schema') || 'public';
	} catch {
		return 'public';
	}
})();
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawSchemaName)) {
	throw new Error(`Nom de schéma invalide dans DATABASE_URL: ${rawSchemaName}`);
}
const schemaName = Prisma.raw(`"${rawSchemaName}"`);

/**
 * Rejoue une lecture sur coupure réseau passagère.
 *
 * La base est distante (Neon) et se met en veille : une requête peut échouer le
 * temps que le calcul redémarre. Sans cela, un incident réseau se lit comme une
 * régression fonctionnelle.
 */
async function resilient<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const unreachable = String(error).includes("Can't reach database server");
			if (!unreachable) throw error;
			await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
		}
	}
	throw lastError;
}

export async function getUser(email: string) {
	return resilient(() => db.user.findUnique({ where: { email } }));
}

/**
 * Déchiffre un secret Better Auth (clé TOTP, codes de secours) — même
 * mécanisme que `scripts/migrate-better-auth-accounts.mjs` et
 * `src/lib/auth/twoFactor.ts` : XChaCha20-Poly1305, clé = `BETTER_AUTH_SECRET`
 * en chaîne brute (jamais l'enveloppe `$ba$<version>$...`, réservée au mode
 * multi-clés, non utilisé ici).
 */
async function decryptBetterAuthSecret(encrypted: string): Promise<string> {
	return symmetricDecrypt({ key: process.env.BETTER_AUTH_SECRET ?? '', data: encrypted });
}

/**
 * Utilisateur enrichi des équivalents Better Auth des anciennes colonnes
 * Lucia `totpKey`/`passwordHash` — ces deux champs n'existent plus sur
 * `User` (voir MIGRATION_BETTER_AUTH.md), mais sont recalculés ici à
 * l'identique pour ne pas devoir réécrire chaque assertion existante :
 *   - `totpKey` : `'configured'` si une ligne `TwoFactor` existe pour ce
 *     compte, sinon `null` — jamais la clé elle-même (les tests ne
 *     comparaient déjà que sa présence, jamais sa valeur).
 *   - `passwordHash` : le hash Argon2id de `AuthAccount` (`providerId:
 *     "credential"`), ou `null` pour un compte sans mot de passe local.
 */
export async function requireUser(email: string) {
	const user = await getUser(email);
	if (!user) throw new Error(`Utilisateur introuvable en base : ${email}`);

	const credentialAccount = await resilient(() =>
		db.authAccount.findUnique({
			where: { providerId_accountId: { providerId: 'credential', accountId: user.id } },
			select: { password: true }
		})
	);

	return {
		...user,
		passwordHash: credentialAccount?.password ?? null,
		// `User.twoFactorEnabled` (Better Auth) ne passe à `true` qu'après une
		// vérification TOTP réussie — jamais pendant une configuration en
		// attente (une ligne `TwoFactor` existe déjà à ce stade, `verified:
		// false`), même sémantique que l'ancien `totpKey` Lucia.
		totpKey: user.twoFactorEnabled ? 'configured' : null
	};
}

/**
 * Clé TOTP déchiffrée, telle qu'enregistrée après la configuration de la
 * 2FA — octets UTF-8 du secret, jamais un décodage base32 (voir
 * `@better-auth/utils/otp` : la chaîne déchiffrée sert directement de clé
 * HMAC, même convention que `src/lib/auth/twoFactor.ts`).
 */
export async function getTotpKey(email: string): Promise<Uint8Array> {
	const user = await requireUser(email);
	const twoFactor = await resilient(() => db.twoFactor.findFirst({ where: { userId: user.id } }));
	if (!twoFactor) throw new Error(`Aucune clé TOTP enregistrée pour ${email}`);
	const secret = await decryptBetterAuthSecret(twoFactor.secret);
	return new TextEncoder().encode(secret);
}

/**
 * Code de secours en clair — un seul par compte (voir `backupCodeOptions`
 * dans `src/lib/auth/index.ts`), déchiffré depuis `TwoFactor.backupCodes`
 * (tableau JSON chiffré d'un seul élément).
 */
export async function getRecoveryCode(email: string): Promise<string> {
	const user = await requireUser(email);
	const twoFactor = await resilient(() => db.twoFactor.findFirst({ where: { userId: user.id } }));
	if (!twoFactor) throw new Error(`Aucun code de récupération pour ${email}`);
	const json = await decryptBetterAuthSecret(twoFactor.backupCodes);
	const codes = JSON.parse(json);
	if (!Array.isArray(codes) || !codes[0]) {
		throw new Error(`Aucun code de récupération pour ${email}`);
	}
	return codes[0];
}

/**
 * Active l'exigence de 2FA. Le commutateur existe côté serveur
 * (`/auth/settings?/isMfaEnabled`) mais son interface est commentée, donc les
 * tests basculent le drapeau en base pour atteindre les parcours 2FA.
 */
export async function enableMfa(email: string) {
	await resilient(() => db.user.update({ where: { email }, data: { isMfaEnabled: true } }));
}

/**
 * Crée un compte minimal qui occupe une adresse email.
 *
 * Sert à vérifier qu'une adresse déjà prise est refusée : seule l'unicité de
 * l'email est en jeu, aucun mot de passe n'est nécessaire.
 */
export async function occupyEmail(email: string) {
	await resilient(() =>
		db.user.create({
			data: {
				email,
				referralCode: `E2E${Date.now()}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
			}
		})
	);
}

/** Passe un compte au rôle administrateur. Le rôle est relu à chaque requête. */
export async function promoteToAdmin(email: string) {
	await resilient(() => db.user.update({ where: { email }, data: { role: 'ADMIN' } }));
}

/** Simule un compte sans mot de passe (façon Google) pour tester le repli confirmText de la suppression RGPD. */
export async function clearUserPassword(email: string) {
	const user = await requireUser(email);
	await resilient(() =>
		db.authAccount.deleteMany({ where: { providerId: 'credential', accountId: user.id } })
	);
}

/** Code promo jetable (admin, API de validation, checkout). */
export async function createPromoCode(
	code: string,
	overrides?: {
		type?: 'PERCENTAGE' | 'FIXED';
		value?: number;
		minAmount?: number | null;
		usageLimit?: number | null;
		usageCount?: number;
		expiresAt?: Date | null;
		active?: boolean;
		loyaltyThreshold?: number | null;
	}
) {
	const promoCode = await resilient(() =>
		db.promoCode.create({
			data: {
				code,
				type: overrides?.type ?? 'PERCENTAGE',
				value: overrides?.value ?? 10,
				minAmount: overrides?.minAmount ?? null,
				usageLimit: overrides?.usageLimit ?? null,
				usageCount: overrides?.usageCount ?? 0,
				expiresAt: overrides?.expiresAt ?? null,
				active: overrides?.active ?? true,
				loyaltyThreshold: overrides?.loyaltyThreshold ?? null
			}
		})
	);
	return {
		...promoCode,
		value: toNumber(promoCode.value),
		minAmount: toNumber(promoCode.minAmount)
	};
}

export async function deletePromoCode(id: string) {
	await resilient(async () => {
		await db.promoCode.deleteMany({ where: { id } });
	});
}

/** Nettoie un code généré par un job (ex. relance panier), pas connu à l'avance. */
export async function deletePromoCodeByCode(code: string) {
	await resilient(() => db.promoCode.deleteMany({ where: { code } }));
}

/** Carte cadeau de test — code fourni explicitement (généré côté app en usage réel). */
export async function createGiftCard(
	code: string,
	overrides?: {
		initialValue?: number;
		balance?: number;
		active?: boolean;
		expiresAt?: Date | null;
		recipientEmail?: string | null;
	}
) {
	const initialValue = overrides?.initialValue ?? 50;
	const giftCard = await resilient(() =>
		db.giftCard.create({
			data: {
				code,
				initialValue,
				balance: overrides?.balance ?? initialValue,
				active: overrides?.active ?? true,
				expiresAt: overrides?.expiresAt ?? null,
				recipientEmail: overrides?.recipientEmail ?? null
			}
		})
	);
	return {
		...giftCard,
		initialValue: toNumber(giftCard.initialValue),
		balance: toNumber(giftCard.balance)
	};
}

export async function getGiftCardById(id: string) {
	const giftCard = await resilient(() => db.giftCard.findUnique({ where: { id } }));
	return giftCard
		? {
				...giftCard,
				initialValue: toNumber(giftCard.initialValue),
				balance: toNumber(giftCard.balance)
			}
		: null;
}

export async function getGiftCardByCode(code: string) {
	const giftCard = await resilient(() => db.giftCard.findUnique({ where: { code } }));
	return giftCard
		? {
				...giftCard,
				initialValue: toNumber(giftCard.initialValue),
				balance: toNumber(giftCard.balance)
			}
		: null;
}

export async function deleteGiftCard(id: string) {
	await resilient(async () => {
		await db.giftCard.deleteMany({ where: { id } });
	});
}

export async function createProductQuestion(
	productId: string,
	userId: string,
	overrides?: { question?: string; answer?: string | null; answeredAt?: Date | null }
) {
	return resilient(() =>
		db.productQuestion.create({
			data: {
				productId,
				userId,
				question: overrides?.question ?? 'Cette pièce est-elle disponible en 52 ?',
				answer: overrides?.answer ?? null,
				answeredAt: overrides?.answeredAt ?? null
			}
		})
	);
}

export async function getProductQuestionById(id: string) {
	return resilient(() => db.productQuestion.findUnique({ where: { id } }));
}

export async function deleteProductQuestion(id: string) {
	await resilient(async () => {
		await db.productQuestion.deleteMany({ where: { id } });
	});
}

export async function createProductVariant(
	productId: string,
	overrides?: { label?: string; sku?: string | null; price?: number | null; stock?: number }
) {
	const variant = await resilient(() =>
		db.productVariant.create({
			data: {
				productId,
				label: overrides?.label ?? 'Taille 54',
				sku: overrides?.sku ?? null,
				price: overrides?.price ?? null,
				stock: overrides?.stock ?? 3
			}
		})
	);
	return { ...variant, price: toNumber(variant.price) };
}

export async function getProductVariantById(id: string) {
	const variant = await resilient(() => db.productVariant.findUnique({ where: { id } }));
	return variant ? { ...variant, price: toNumber(variant.price) } : null;
}

export async function deleteProductVariant(id: string) {
	await resilient(async () => {
		await db.orderItem.updateMany({ where: { variantId: id }, data: { variantId: null } });
		await db.productVariant.deleteMany({ where: { id } });
	});
}

/** CONTACT-PLUGIN : message de test isolé. */
export async function createContactMessage(overrides?: {
	name?: string;
	email?: string;
	subject?: string;
	message?: string;
}) {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return resilient(() =>
		db.contactSubmission.create({
			data: {
				name: overrides?.name ?? `e2e-contact-${stamp}`,
				email: overrides?.email ?? `e2e-contact-${stamp}@example.test`,
				subject: overrides?.subject ?? `Sujet e2e ${stamp}`,
				message: overrides?.message ?? `Message de test e2e ${stamp}.`
			}
		})
	);
}

export async function deleteContactMessage(id: string) {
	await resilient(async () => {
		await db.contactSubmission.deleteMany({ where: { id } });
	});
}

export async function deleteContactMessagesByEmail(email: string) {
	await resilient(async () => {
		await db.contactSubmission.deleteMany({ where: { email } });
	});
}

export async function countContactMessagesByEmail(email: string) {
	return resilient(() => db.contactSubmission.count({ where: { email } }));
}

export async function findPromoCode(id: string) {
	const promoCode = await resilient(() => db.promoCode.findUnique({ where: { id } }));
	return promoCode
		? { ...promoCode, value: toNumber(promoCode.value), minAmount: toNumber(promoCode.minAmount) }
		: null;
}

export async function findPromoCodeByCode(code: string) {
	const promoCode = await resilient(() => db.promoCode.findUnique({ where: { code } }));
	return promoCode
		? { ...promoCode, value: toNumber(promoCode.value), minAmount: toNumber(promoCode.minAmount) }
		: null;
}

/**
 * Taxonomie « Catégorie » partagée par les tests de catalogue — jamais
 * supprimée (seules les valeurs jetables `e2e-cat-*` qu'elle porte le sont).
 * `upsert` sur le slug évite toute collision entre workers Playwright.
 */
async function ensureCatalogTaxonomy() {
	return resilient(() =>
		db.taxonomy.upsert({
			where: { slug: 'e2e-categorie' },
			update: {},
			create: { name: 'E2E Catégorie', slug: 'e2e-categorie', type: 'TEXT', multiple: true }
		})
	);
}

/**
 * Image des produits de test — servie par l'application elle-même.
 *
 * Une URL externe (`https://example.test/...`) forçait le navigateur à tenter
 * une résolution DNS vouée à l'échec sur CHAQUE page produit, avec un délai
 * variable selon le résolveur : source d'échecs intermittents sur l'ajout au
 * panier, et violation de la CSP (`img-src 'self' data:`) à chaque rendu.
 */
const E2E_PRODUCT_IMAGE = '/pwa/NoticeModele.png';

/** Catalogue : produit de test isolé (image factice, pas d'upload Cloudinary). */
export async function createCatalogProduct(overrides?: {
	name?: string;
	slug?: string;
	stock?: number;
	price?: number;
	compareAtPrice?: number | null;
}) {
	const stamp = `${Date.now()}`;
	const category = await createCatalogCategory();
	const created = await resilient(() =>
		db.product.create({
			data: {
				name: overrides?.name ?? `e2e-prod-${stamp}`,
				slug: overrides?.slug ?? `e2e-prod-${stamp}`,
				description: 'Produit de test e2e pour le catalogue.',
				price: overrides?.price ?? 12.5,
				compareAtPrice: overrides?.compareAtPrice ?? null,
				stock: overrides?.stock ?? 10,
				images: [E2E_PRODUCT_IMAGE],
				colorProduct: '#112233',
				taxonomyValues: { create: { taxonomyValueId: category.id } }
			}
		})
	);
	const product = {
		...created,
		price: toNumber(created.price),
		compareAtPrice: toNumber(created.compareAtPrice)
	};
	return { product, category };
}

/**
 * Produit de test avec un `createdAt` volontairement ancien, pour les tests
 * de purge (`/admin/exports`). Le décalage doit rester net (plusieurs mois)
 * pour ne jamais recouper un produit fraîchement créé par un autre test.
 */
export async function createOldCatalogProduct(daysAgo: number, overrides?: { name?: string }) {
	const stamp = `${Date.now()}`;
	const category = await createCatalogCategory();
	const created = await resilient(() =>
		db.product.create({
			data: {
				name: overrides?.name ?? `e2e-prod-old-${stamp}`,
				slug: overrides?.name ?? `e2e-prod-old-${stamp}`,
				description: 'Produit de test e2e pour la purge.',
				price: 12.5,
				stock: 10,
				images: [E2E_PRODUCT_IMAGE],
				colorProduct: '#112233',
				createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
				taxonomyValues: { create: { taxonomyValueId: category.id } }
			}
		})
	);
	const product = {
		...created,
		price: toNumber(created.price),
		compareAtPrice: toNumber(created.compareAtPrice)
	};
	return { product, category };
}

export async function getProductBySlug(slug: string) {
	const product = await resilient(() => db.product.findUnique({ where: { slug } }));
	return product
		? {
				...product,
				price: toNumber(product.price),
				compareAtPrice: toNumber(product.compareAtPrice)
			}
		: null;
}

export async function getProductById(id: string) {
	const product = await resilient(() =>
		db.product.findUnique({
			where: { id },
			include: { taxonomyValues: { include: { taxonomyValue: true } } }
		})
	);
	return product
		? {
				...product,
				price: toNumber(product.price),
				compareAtPrice: toNumber(product.compareAtPrice)
			}
		: null;
}

export async function getProductByName(name: string) {
	const product = await resilient(() => db.product.findFirst({ where: { name } }));
	return product
		? {
				...product,
				price: toNumber(product.price),
				compareAtPrice: toNumber(product.compareAtPrice)
			}
		: null;
}

/** Blog : auteur isolé, pour poster directement vers `?/createPost` sans passer par `createBlogPost()`. */
export async function createBlogAuthor() {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return resilient(() => db.blogAuthor.create({ data: { name: `e2e-blog-author-${stamp}` } }));
}

/** Blog : valeur de taxonomie « Catégorie » isolée. */
export async function createBlogCategoryValue(value?: string) {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const categoryTaxonomy = await resilient(() =>
		db.blogTaxonomy.findUniqueOrThrow({ where: { slug: 'categorie' } })
	);
	return resilient(() =>
		db.blogTaxonomyValue.create({
			data: { taxonomyId: categoryTaxonomy.id, value: value ?? `e2e-blog-cat-${stamp}` }
		})
	);
}

/** Blog : article de test isolé (auteur + valeur de taxonomie « Catégorie » dédiés). */
export async function createBlogPost(overrides?: {
	title?: string;
	slug?: string;
	published?: boolean;
	/** Réutilise une valeur de catégorie existante au lieu d'en créer une (ex: articles liés). */
	categoryValueId?: string;
	/** Crée et assigne une valeur de la taxonomie « Tag ». */
	tagValue?: string;
}) {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const author = await resilient(() =>
		db.blogAuthor.create({ data: { name: `e2e-blog-author-${stamp}` } })
	);
	let categoryValue: { id: string; value: string };
	if (overrides?.categoryValueId) {
		categoryValue = await resilient(() =>
			db.blogTaxonomyValue.findUniqueOrThrow({ where: { id: overrides.categoryValueId } })
		);
	} else {
		const categoryTaxonomy = await resilient(() =>
			db.blogTaxonomy.findUniqueOrThrow({ where: { slug: 'categorie' } })
		);
		categoryValue = await resilient(() =>
			db.blogTaxonomyValue.create({
				data: { taxonomyId: categoryTaxonomy.id, value: `e2e-blog-cat-${stamp}` }
			})
		);
	}
	let tagValue: { id: string; value: string } | undefined;
	if (overrides?.tagValue) {
		const tagTaxonomy = await resilient(() =>
			db.blogTaxonomy.findUniqueOrThrow({ where: { slug: 'tag' } })
		);
		tagValue = await resilient(() =>
			db.blogTaxonomyValue.create({
				data: { taxonomyId: tagTaxonomy.id, value: overrides.tagValue! }
			})
		);
	}
	const post = await resilient(() =>
		db.blogPost.create({
			data: {
				title: overrides?.title ?? `e2e-post-${stamp}`,
				slug: overrides?.slug ?? `e2e-post-${stamp}`,
				content: '<p>Contenu de test e2e pour le blog.</p>',
				published: overrides?.published ?? true,
				authorId: author.id,
				taxonomyValues: {
					create: [
						{ taxonomyValueId: categoryValue.id },
						...(tagValue ? [{ taxonomyValueId: tagValue.id }] : [])
					]
				}
			}
		})
	);
	return {
		post,
		author,
		category: { id: categoryValue.id, name: categoryValue.value },
		tag: tagValue ? { id: tagValue.id, name: tagValue.value } : undefined
	};
}

export async function getBlogPostBySlug(slug: string) {
	return resilient(() => db.blogPost.findUnique({ where: { slug } }));
}

export async function getBlogPostById(id: string) {
	return resilient(() => db.blogPost.findUnique({ where: { id } }));
}

export async function setBlogPostPublished(id: string, published: boolean) {
	return resilient(() => db.blogPost.update({ where: { id }, data: { published } }));
}

export async function updateBlogPostTitle(id: string, title: string) {
	return resilient(() => db.blogPost.update({ where: { id }, data: { title } }));
}

export async function deleteBlogPost(postId: string) {
	const post = await resilient(() =>
		db.blogPost.findUnique({
			where: { id: postId }
		})
	);
	if (!post) return;

	// Récupéré avant suppression du post : la cascade DB retire ensuite la
	// ligne `BlogPostTaxonomyValue` en même temps que le post.
	const categoryLink = await resilient(() =>
		db.blogPostTaxonomyValue.findFirst({
			where: { postId, taxonomyValue: { taxonomy: { slug: 'categorie' } } }
		})
	);
	const tagLinks = await resilient(() =>
		db.blogPostTaxonomyValue.findMany({
			where: { postId, taxonomyValue: { taxonomy: { slug: 'tag' } } }
		})
	);

	await resilient(() => db.blogComment.deleteMany({ where: { postId } }));
	await resilient(() => db.blogPost.deleteMany({ where: { id: postId } }));

	const remainingForAuthor = await resilient(() =>
		db.blogPost.count({ where: { authorId: post.authorId } })
	);
	if (remainingForAuthor === 0) {
		await resilient(() =>
			db.blogAuthor.deleteMany({
				where: { id: post.authorId, name: { startsWith: 'e2e-blog-author-' } }
			})
		);
	}

	for (const tagLink of tagLinks) {
		const remainingForTag = await resilient(() =>
			db.blogPostTaxonomyValue.count({ where: { taxonomyValueId: tagLink.taxonomyValueId } })
		);
		if (remainingForTag === 0) {
			await resilient(() =>
				db.blogTaxonomyValue.deleteMany({ where: { id: tagLink.taxonomyValueId } })
			);
		}
	}

	if (categoryLink) {
		const remainingForCategory = await resilient(() =>
			db.blogPostTaxonomyValue.count({ where: { taxonomyValueId: categoryLink.taxonomyValueId } })
		);
		if (remainingForCategory === 0) {
			await resilient(() =>
				db.blogTaxonomyValue.deleteMany({
					where: { id: categoryLink.taxonomyValueId, value: { startsWith: 'e2e-blog-cat-' } }
				})
			);
		}
	}
}

/** Relie un produit à une commande, pour vérifier le refus de suppression. */
export async function linkProductToOrder(
	userId: string,
	productId: string,
	overrides?: { variantId?: string; status?: 'PENDING' | 'PAID' | 'SHIPPED' | 'CANCELLED' }
) {
	const order = await resilient(() =>
		db.order.create({ data: { userId, status: overrides?.status } })
	);
	const item = await resilient(() =>
		db.orderItem.create({
			data: { orderId: order.id, productId, variantId: overrides?.variantId, quantity: 1, price: 1 }
		})
	);
	return { order: mapOrderDecimals(order), item: { ...item, price: toNumber(item.price) } };
}

/**
 * Commande payée regroupant plusieurs produits en une fois — construit un
 * historique de co-achat (bundle « souvent achetés ensemble »). Pas de
 * `Transaction` créée : suffisant pour les lectures qui ne portent que sur
 * `Order`/`OrderItem` (contrairement à `simulatePaidOrder`, qui simule un
 * paiement complet).
 */
export async function createPaidOrderWithProducts(userId: string, productIds: string[]) {
	const order = await resilient(() => db.order.create({ data: { userId, status: 'PAID' } }));
	for (const productId of productIds) {
		await resilient(() =>
			db.orderItem.create({ data: { orderId: order.id, productId, quantity: 1, price: 1 } })
		);
	}
	return mapOrderDecimals(order);
}

/**
 * Recule `Order.updatedAt` de `hoursAgo` heures — nécessaire pour simuler un
 * panier abandonné sans attendre réellement 1h/24h. `@updatedAt` est
 * réécrit par le moteur Prisma sur tout `update()` classique (la valeur
 * fournie est ignorée), d'où le passage par `$executeRaw`. Table qualifiée
 * avec `schemaName` (déduit de `DATABASE_URL`, cf. plus haut) : contrairement
 * aux requêtes générées par le client Prisma, le SQL brut ne suit pas le
 * paramètre `schema=` de `DATABASE_URL` (pas de `search_path` positionné
 * côté session) — sans préfixe explicite, la commande s'exécute
 * silencieusement dans le mauvais schéma et ne trouve jamais la ligne
 * (0 ligne affectée, aucune erreur).
 */
export async function backdateOrder(orderId: string, hoursAgo: number) {
	await resilient(
		() =>
			db.$executeRaw`UPDATE ${schemaName}."orders" SET "updatedAt" = NOW() - (${hoursAgo}::float * interval '1 hour') WHERE id = ${orderId}`
	);
}

/** Relance panier abandonné / avis produit : horodatages d'envoi, pour les assertions. */
export async function getOrderReminderState(orderId: string) {
	return resilient(() =>
		db.order.findUniqueOrThrow({
			where: { id: orderId },
			select: {
				cartReminder1SentAt: true,
				cartReminder2SentAt: true,
				reviewReminderSentAt: true
			}
		})
	);
}

/**
 * Consultation de fiche produit simulée (`ProductView`) — pas de raw SQL
 * nécessaire ici contrairement à `backdateOrder` : `viewedAt` n'est pas un
 * champ `@updatedAt`, un `upsert()` classique suffit à le reculer dans le
 * temps pour simuler une consultation ancienne sans attendre réellement.
 */
export async function createProductView(
	userId: string,
	productId: string,
	overrides?: { viewedAt?: Date }
) {
	return resilient(() =>
		db.productView.upsert({
			where: { userId_productId: { userId, productId } },
			update: { viewedAt: overrides?.viewedAt ?? new Date() },
			create: { userId, productId, viewedAt: overrides?.viewedAt ?? new Date() }
		})
	);
}

export async function getProductViewState(userId: string, productId: string) {
	return resilient(() =>
		db.productView.findUniqueOrThrow({
			where: { userId_productId: { userId, productId } },
			select: { viewedAt: true, reminderSentAt: true }
		})
	);
}

export async function deleteCatalogProduct(productId: string) {
	const product = await resilient(() =>
		db.product.findUnique({
			where: { id: productId },
			include: { taxonomyValues: true }
		})
	);
	if (!product) return;

	await resilient(() => db.orderItem.deleteMany({ where: { productId } }));
	await resilient(() => db.productTaxonomyValue.deleteMany({ where: { productId } }));
	await resilient(() => db.product.deleteMany({ where: { id: productId } }));

	for (const link of product.taxonomyValues) {
		const remaining = await resilient(() =>
			db.productTaxonomyValue.count({ where: { taxonomyValueId: link.taxonomyValueId } })
		);
		if (remaining === 0) {
			await resilient(() =>
				db.taxonomyValue.deleteMany({
					where: { id: link.taxonomyValueId, value: { startsWith: 'e2e-cat-' } }
				})
			);
		}
	}
}

/** Compte les sessions Better Auth actives (`AuthSession`) d'un compte. */
export async function countSessions(email: string): Promise<number> {
	const user = await requireUser(email);
	return resilient(() => db.authSession.count({ where: { userId: user.id } }));
}

/**
 * Empreinte publique d'une session, même calcul que `sessionPublicId()`
 * (`src/lib/auth/session.ts`) — dupliquée ici volontairement (`e2e/support/**`
 * n'importe jamais `#lib`).
 */
export function sessionPublicId(sessionId: string): string {
	return createHash('sha256').update(sessionId).digest('hex');
}

/**
 * Empreinte publique de la session désignée par la valeur BRUTE du cookie
 * navigateur (`better-auth.session_token`, signée : `<token>.<signature>`,
 * encodée URL).
 *
 * `AuthSession.id` (l'id de ligne, ce que `sessionPublicId` hache côté
 * application) est distinct de `AuthSession.token` (le secret porté par le
 * cookie) sous Better Auth — contrairement à Lucia, où les deux étaient
 * confondus. On retrouve donc la ligne par son `token` avant de hacher son
 * `id`.
 */
export async function sessionPublicIdFromCookieValue(cookieValue: string): Promise<string> {
	const decoded = decodeURIComponent(cookieValue);
	const token = decoded.slice(0, decoded.lastIndexOf('.'));
	const session = await resilient(() => db.authSession.findUnique({ where: { token } }));
	if (!session) throw new Error('Session introuvable pour ce cookie');
	return sessionPublicId(session.id);
}

/**
 * Insère directement une session valide pour un utilisateur, sans passer par
 * un vrai login navigateur — sert à prouver qu'une action admin (reset mot de
 * passe, bascule MFA) révoque bien les sessions existantes de la CIBLE, sans
 * avoir à simuler un parcours de connexion complet dans le test. Jamais un
 * cookie réellement valide (`token` n'est jamais signé/posé navigateur),
 * seulement une ligne `AuthSession` à compter/révoquer.
 */
export async function createRawSession(userId: string) {
	return resilient(() =>
		db.authSession.create({
			data: {
				token: randomBytes(20).toString('hex'),
				userId,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
			}
		})
	);
}

/**
 * Insère directement une session déjà expirée — sert à prouver que le job de
 * purge (`/api/jobs/cleanup`, `runCleanupJob`) la supprime bien, sans avoir à
 * attendre 30 jours ou à trafiquer `expiresAt` après coup (contrairement à
 * `updatedAt`, ce champ n'est pas géré par `@updatedAt`, un `create` avec une
 * date passée suffit).
 */
export async function createExpiredSession(userId: string) {
	return resilient(() =>
		db.authSession.create({
			data: {
				token: randomBytes(20).toString('hex'),
				userId,
				expiresAt: new Date(Date.now() - 60 * 60 * 1000)
			}
		})
	);
}

/**
 * Insère une session « autre appareil » directement en base, sans passer par
 * un vrai navigateur — suffisant pour tester la liste/révocation
 * (`/auth/settings/sessions`), qui ne lit que les colonnes de `AuthSession`,
 * jamais un cookie réellement valide pour cette session-là.
 */
export async function createExtraSessionForUser(
	userId: string,
	overrides?: { userAgent?: string; city?: string; country?: string; lastActiveAt?: Date }
) {
	return resilient(() =>
		db.authSession.create({
			data: {
				token: `e2e-session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				userId,
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
				userAgent:
					overrides?.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/128.0',
				city: overrides?.city ?? 'Lyon',
				country: overrides?.country ?? 'FR',
				lastActiveAt: overrides?.lastActiveAt ?? new Date()
			}
		})
	);
}

/**
 * Historique des connexions (`LoginEvent`), le plus récent d'abord — pour
 * vérifier la détection « nouvel appareil » (`recordLoginEvent`) sans
 * dépendre du timing d'envoi de l'e-mail d'alerte, qui est fire-and-forget.
 */
export async function getLoginEvents(email: string) {
	const user = await requireUser(email);
	return resilient(() =>
		db.loginEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
	);
}

/**
 * Nettoyage en fin de test.
 *
 * Les commandes doivent partir en premier : l'application crée un panier
 * (commande au statut PENDING) dès qu'un utilisateur authentifié charge une
 * page, et la relation `Order → User` est en `Restrict`. Le reste (sessions,
 * demandes de vérification, sessions de réinitialisation) part en cascade.
 */
function mapOrderWithItems<
	T extends Parameters<typeof mapOrderDecimals>[0] & { items: Array<{ price: Prisma.Decimal }> }
>(order: T) {
	return {
		...mapOrderDecimals(order),
		items: order.items.map((item) => ({ ...item, price: toNumber(item.price) }))
	};
}

export async function getPendingOrder(userId: string) {
	const order = await resilient(() =>
		db.order.findFirst({
			where: { userId, status: 'PENDING' },
			include: { items: true }
		})
	);
	return order ? mapOrderWithItems(order) : null;
}

export async function getOrderById(orderId: string) {
	const order = await resilient(() =>
		db.order.findUnique({
			where: { id: orderId },
			include: { items: true }
		})
	);
	return order ? mapOrderWithItems(order) : null;
}

export async function attachOrderAddress(orderId: string, addressId: string) {
	const order = await resilient(() =>
		db.order.update({
			where: { id: orderId },
			data: {
				shippingAddressId: addressId,
				billingAddressId: addressId,
				shippingOption: 'no_shipping',
				shippingCost: 0
			}
		})
	);
	return mapOrderDecimals(order);
}

/**
 * Pose directement `promoCode`/`giftCardCode`/`giftCardAmount` sur une
 * commande — simule ce que `createCheckoutSession` écrit avant la session
 * Stripe, pour tester la consommation réelle (webhook) sans repasser par le
 * formulaire `/checkout?/checkout`.
 */
export async function attachOrderDiscount(
	orderId: string,
	discount: { promoCode?: string; giftCardCode?: string; giftCardAmount?: number }
) {
	const order = await resilient(() =>
		db.order.update({
			where: { id: orderId },
			data: {
				promoCode: discount.promoCode,
				giftCardCode: discount.giftCardCode,
				giftCardAmount: discount.giftCardAmount
			}
		})
	);
	return mapOrderDecimals(order);
}

export async function getTransactionByStripePaymentId(stripePaymentId: string) {
	const transaction = await resilient(() =>
		db.transaction.findUnique({
			where: { stripePaymentId }
		})
	);
	return transaction ? mapTransactionDecimals(transaction) : null;
}

export async function findAddressesByUserId(userId: string) {
	return resilient(() => db.address.findMany({ where: { userId } }));
}

export async function findAddressById(id: string) {
	return resilient(() => db.address.findUnique({ where: { id } }));
}

/**
 * Valeur jetable de la taxonomie « Catégorie » de test — remplace l'ancienne
 * `Category` legacy. Le nom (`.name`) est conservé pour ne pas faire bouger
 * les specs qui l'utilisent comme libellé affiché dans l'UI.
 */
export async function createCatalogCategory() {
	const taxonomy = await ensureCatalogTaxonomy();
	const name = `e2e-cat-${Date.now()}`;
	const value = await resilient(() =>
		db.taxonomyValue.create({ data: { taxonomyId: taxonomy.id, value: name, label: name } })
	);
	return { id: value.id, name: value.value };
}

export async function deleteCatalogCategory(id: string) {
	await resilient(() =>
		db.taxonomyValue.deleteMany({ where: { id, value: { startsWith: 'e2e-cat-' } } })
	);
}

/**
 * `Category`/`ProductCategory` legacy — non retirés tant que la migration B
 * n'est pas passée, seul consommateur restant : `getRelatedProducts` (ventes
 * croisées). Sans rapport avec `createCatalogCategory` ci-dessus (taxonomie).
 */
export async function createLegacyCategory(name?: string) {
	return resilient(() =>
		db.category.create({ data: { name: name ?? `e2e-legacy-cat-${Date.now()}` } })
	);
}

export async function linkProductToLegacyCategory(productId: string, categoryId: string) {
	return resilient(() => db.productCategory.create({ data: { productId, categoryId } }));
}

/** Supprime la catégorie legacy : cascade sur ses `ProductCategory`. */
export async function deleteLegacyCategory(id: string) {
	await resilient(() => db.category.deleteMany({ where: { id } }));
}

export async function createUserAddress(
	userId: string,
	overrides?: { country?: string; country_code?: string; city?: string; zip?: string }
) {
	return resilient(() =>
		db.address.create({
			data: {
				userId,
				first_name: 'E2e',
				last_name: 'Tester',
				phone: '+33600000000',
				street_number: '1',
				street: 'Rue des Tests',
				city: overrides?.city ?? 'Toulouse',
				county: 'Haute-Garonne',
				state: 'Occitanie',
				stateLetter: 'FR',
				state_code: 'OC',
				zip: overrides?.zip ?? '31000',
				country: overrides?.country ?? 'France',
				country_code: overrides?.country_code ?? 'FR',
				ISO_3166_1_alpha_3: 'FRA'
			}
		})
	);
}

/** Paiement simulé : Transaction + Order PAID, sans Stripe. */
export async function simulatePaidOrder(
	orderId: string,
	userId: string,
	email: string,
	overrides?: { shippingOption?: string }
) {
	const stamp = `${Date.now()}`;
	const transaction = await resilient(() =>
		db.transaction.create({
			data: {
				stripePaymentId: `e2e-stripe-${stamp}`,
				orderId,
				userId,
				amount: 12.5,
				currency: 'eur',
				customer_details_email: email,
				customer_details_name: 'E2e Tester',
				status: 'paid',
				shippingOption: overrides?.shippingOption ?? 'no_shipping',
				shippingCost: 0,
				shippingMethodId: 0,
				shippingMethodName: 'e2e',
				package_length: 10,
				package_width: 10,
				package_height: 10,
				package_dimension_unit: 'cm',
				package_weight: 1,
				package_weight_unit: 'kg',
				package_volume: 1000,
				package_volume_unit: 'cm3',
				address_first_name: 'E2e',
				address_last_name: 'Tester',
				address_phone: '+33600000000',
				address_street_number: '1',
				address_street: 'Rue des Tests',
				address_city: 'Toulouse',
				address_county: 'Haute-Garonne',
				address_state: 'Occitanie',
				address_stateLetter: 'FR',
				address_state_code: 'OC',
				address_zip: '31000',
				address_country: 'France',
				address_country_code: 'FR',
				address_ISO_3166_1_alpha_3: 'FRA',
				billing_first_name: 'E2e',
				billing_last_name: 'Tester',
				billing_phone: '+33600000000',
				billing_street_number: '1',
				billing_street: 'Rue des Tests',
				billing_city: 'Toulouse',
				billing_county: 'Haute-Garonne',
				billing_state: 'Occitanie',
				billing_stateLetter: 'FR',
				billing_state_code: 'OC',
				billing_zip: '31000',
				billing_country: 'France',
				billing_country_code: 'FR',
				billing_ISO_3166_1_alpha_3: 'FRA',
				products: []
			}
		})
	);
	await resilient(() => db.order.update({ where: { id: orderId }, data: { status: 'PAID' } }));
	return mapTransactionDecimals(transaction);
}

export async function getTransactionById(id: string) {
	const transaction = await resilient(() => db.transaction.findUnique({ where: { id } }));
	return transaction ? mapTransactionDecimals(transaction) : null;
}

/**
 * Place `Transaction.createdAt` dans le mois comptable voulu (export
 * périodique, `#lib/server/jobs/accountingExport.ts`) — champ simple
 * (`@default(now())`, pas `@updatedAt`), directement réécrivable par un
 * `update()` classique, contrairement à `Order.updatedAt` (`backdateOrder`).
 */
export async function setTransactionCreatedAt(transactionId: string, createdAt: Date) {
	await resilient(() =>
		db.transaction.update({ where: { id: transactionId }, data: { createdAt } })
	);
}

/**
 * Supprime la trace d'idempotence d'un export comptable pour une période
 * (`YYYY-MM`) — nécessaire en nettoyage de test : sans ça, un run ultérieur
 * du test pour le même mois calendaire trouverait `AccountingExportLog`
 * déjà présent et sauterait l'envoi (`sent: false`) dès le premier appel.
 */
export async function deleteAccountingExportLog(period: string) {
	await resilient(() => db.accountingExportLog.deleteMany({ where: { period } }));
}

/** Pose `sendcloudParcelId` — clé de rapprochement du webhook Sendcloud entrant. */
export async function setSendcloudParcelId(transactionId: string, parcelId: number) {
	await resilient(() =>
		db.transaction.update({ where: { id: transactionId }, data: { sendcloudParcelId: parcelId } })
	);
}

/**
 * Simule ce que le webhook Stripe recopie normalement depuis `Order` sur
 * `Transaction` à la création (voir `handleCheckoutSession`,
 * `src/routes/api/webhooks/+server.ts`) — utile pour tester l'affichage
 * admin (`/admin/sales`) sans faire aboutir un vrai paiement Stripe.
 */
export async function setTransactionRisk(
	transactionId: string,
	risk: { riskScore: number; riskLevel: string; riskFactors: string[] }
) {
	await resilient(() => db.transaction.update({ where: { id: transactionId }, data: risk }));
}

export async function getFraudBlockByOrderId(orderId: string) {
	return resilient(() => db.fraudBlock.findFirst({ where: { orderId } }));
}

export async function deleteTransaction(id: string) {
	await resilient(() => db.transaction.deleteMany({ where: { id } }));
}

/**
 * Nettoyage en fin de test.
 *
 * Les commandes doivent partir en premier : l'application crée un panier
 * (commande au statut PENDING) dès qu'un utilisateur authentifié charge une
 * page, et la relation `Order → User` est en `Restrict`. Le reste (sessions,
 * demandes de vérification, sessions de réinitialisation) part en cascade.
 */
export async function deleteUser(email: string) {
	const user = await getUser(email);
	if (!user) return;

	await resilient(() => db.transaction.deleteMany({ where: { userId: user.id } }));
	await resilient(() => db.order.deleteMany({ where: { userId: user.id } }));
	await resilient(() => db.user.delete({ where: { id: user.id } }));
}

/** Taxonomie de test isolée (CRUD admin générique — remplace l'ancienne "Matière"). */
export async function createTaxonomy(overrides?: {
	name?: string;
	slug?: string;
	multiple?: boolean;
}) {
	const stamp = `${Date.now()}`;
	return resilient(() =>
		db.taxonomy.create({
			data: {
				name: overrides?.name ?? `e2e-taxonomy-${stamp}`,
				slug: overrides?.slug ?? `e2e-taxonomy-${stamp}`,
				type: 'TEXT',
				multiple: overrides?.multiple ?? false
			}
		})
	);
}

export async function getTaxonomyById(id: string) {
	return resilient(() => db.taxonomy.findUnique({ where: { id } }));
}

export async function getTaxonomyByName(name: string) {
	return resilient(() => db.taxonomy.findFirst({ where: { name } }));
}

/** Cascade DB (`onDelete: Cascade`) : supprime aussi ses valeurs et les liaisons produit. */
export async function deleteTaxonomy(id: string) {
	await resilient(() => db.taxonomy.deleteMany({ where: { id } }));
}

export async function createTaxonomyValue(taxonomyId: string, overrides?: { value?: string }) {
	return resilient(() =>
		db.taxonomyValue.create({
			data: { taxonomyId, value: overrides?.value ?? `e2e-value-${Date.now()}` }
		})
	);
}

export async function getTaxonomyValueById(id: string) {
	return resilient(() => db.taxonomyValue.findUnique({ where: { id } }));
}

/** Avis produit : pose un avis directement en base (sans passer par la fiche produit). */
export async function createReview(overrides: {
	productId: string;
	userId: string;
	rating?: number;
	comment?: string | null;
}) {
	return resilient(() =>
		db.review.create({
			data: {
				productId: overrides.productId,
				userId: overrides.userId,
				rating: overrides.rating ?? 5,
				comment: overrides.comment ?? null
			}
		})
	);
}

export async function getReviewForUser(productId: string, userId: string) {
	return resilient(() =>
		db.review.findUnique({ where: { productId_userId: { productId, userId } } })
	);
}

/** Liste d'envies : bascule directe en base (sans passer par la fiche produit). */
export async function isInWishlistDb(userId: string, productId: string): Promise<boolean> {
	const item = await resilient(() =>
		db.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } } })
	);
	return item !== null;
}

/** Liste d'envies : lecture complète (baseline `lastNotifiedPrice`/`lastNotifiedFlashSaleEndsAt`). */
export async function getWishlistItem(userId: string, productId: string) {
	const item = await resilient(() =>
		db.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } } })
	);
	return item ? { ...item, lastNotifiedPrice: toNumber(item.lastNotifiedPrice) } : null;
}

/**
 * Réglages boutique (`StoreSettings`, ligne unique `id = "singleton"`).
 *
 * Ligne partagée par toute la suite : chaque test qui modifie un module doit
 * restaurer les valeurs lues par `getStoreFeatureFlags` (`finally` avec
 * `setStoreFeatureFlags(previous)`), pour ne pas laisser un module activé/
 * désactivé pour les tests suivants.
 */
export async function getStoreFeatureFlags() {
	const row = await resilient(() =>
		db.storeSettings.findUniqueOrThrow({
			where: { id: 'singleton' },
			select: {
				wishlistEnabled: true,
				crossSellEnabled: true,
				returnsEnabled: true,
				savedPaymentsEnabled: true,
				loyaltyEnabled: true,
				giftCardsEnabled: true,
				productQnaEnabled: true,
				cartRecoveryEnabled: true,
				flashSaleEnabled: true,
				referralEnabled: true,
				stockAlertsEnabled: true,
				frequentlyBoughtTogetherEnabled: true,
				wishlistPriceAlertEnabled: true,
				fraudDetectionEnabled: true,
				fraudBlockingEnabled: true,
				recentlyViewedReminderEnabled: true,
				reviewReminderEnabled: true,
				vatRate: true,
				estimatedDeliveryMinDays: true,
				estimatedDeliveryMaxDays: true,
				companyName: true,
				companyLegalForm: true,
				companyShareCapital: true,
				companyAddress: true,
				companyCity: true,
				companySiret: true,
				companyVatNumber: true,
				companyPublicationDirector: true,
				companyPhone: true,
				companyEmail: true,
				companyLogoUrl: true
			}
		})
	);
	return row;
}

export async function setStoreFeatureFlags(patch: {
	wishlistEnabled?: boolean;
	crossSellEnabled?: boolean;
	returnsEnabled?: boolean;
	savedPaymentsEnabled?: boolean;
	loyaltyEnabled?: boolean;
	giftCardsEnabled?: boolean;
	productQnaEnabled?: boolean;
	cartRecoveryEnabled?: boolean;
	flashSaleEnabled?: boolean;
	referralEnabled?: boolean;
	stockAlertsEnabled?: boolean;
	frequentlyBoughtTogetherEnabled?: boolean;
	wishlistPriceAlertEnabled?: boolean;
	fraudDetectionEnabled?: boolean;
	fraudBlockingEnabled?: boolean;
	recentlyViewedReminderEnabled?: boolean;
	reviewReminderEnabled?: boolean;
	vatRate?: number;
	estimatedDeliveryMinDays?: number | null;
	estimatedDeliveryMaxDays?: number | null;
	companyName?: string | null;
	companyLegalForm?: string | null;
	companyShareCapital?: string | null;
	companyAddress?: string | null;
	companyCity?: string | null;
	companySiret?: string | null;
	companyVatNumber?: string | null;
	companyPublicationDirector?: string | null;
	companyPhone?: string | null;
	companyEmail?: string | null;
	companyLogoUrl?: string | null;
}) {
	return resilient(() => db.storeSettings.update({ where: { id: 'singleton' }, data: patch }));
}

/** Retours/SAV : lecture par transaction (unique), pour les assertions. */
export async function getReturnRequestByTransactionId(transactionId: string) {
	return resilient(() => db.returnRequest.findUnique({ where: { transactionId } }));
}

/**
 * Moyens de paiement enregistrés : insertion directe, sans passer par
 * l'action `attach` (qui appelle Stripe pour relire la carte) — cette
 * dernière n'est pas rejouable en e2e sans une vraie `PaymentMethod` Stripe.
 */
export async function createSavedPaymentMethod(
	userId: string,
	overrides?: {
		stripePaymentMethodId?: string;
		brand?: string;
		last4?: string;
		expMonth?: number;
		expYear?: number;
		isDefault?: boolean;
	}
) {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return resilient(() =>
		db.savedPaymentMethod.create({
			data: {
				userId,
				stripePaymentMethodId: overrides?.stripePaymentMethodId ?? `e2e-pm-${stamp}`,
				brand: overrides?.brand ?? 'visa',
				last4: overrides?.last4 ?? '4242',
				expMonth: overrides?.expMonth ?? 12,
				expYear: overrides?.expYear ?? 2099,
				isDefault: overrides?.isDefault ?? false
			}
		})
	);
}

export async function getSavedPaymentMethodsByUserId(userId: string) {
	return resilient(() => db.savedPaymentMethod.findMany({ where: { userId } }));
}

/** Fidélité : attribution éventuelle d'un code à un compte, pour un code donné. */
export async function getLoyaltyAward(userId: string, promoCodeId: string) {
	return resilient(() =>
		db.loyaltyAward.findUnique({ where: { userId_promoCodeId: { userId, promoCodeId } } })
	);
}

/** Parrainage : récompense éventuelle du parrain pour un filleul donné. */
export async function getReferralReward(referredId: string) {
	return resilient(() => db.referralReward.findUnique({ where: { referredId } }));
}

/** Alertes réassort : inscription éventuelle d'un compte sur un produit donné. */
export async function getStockAlert(productId: string, userId: string) {
	return resilient(() =>
		db.stockAlert.findUnique({ where: { productId_userId: { productId, userId } } })
	);
}
