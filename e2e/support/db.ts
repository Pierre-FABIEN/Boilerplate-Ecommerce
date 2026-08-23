import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'node:crypto';

/**
 * Client Prisma dédié aux tests, branché explicitement sur l'URL de `.env.test`
 * (schéma PostgreSQL `e2e`), afin de ne jamais toucher les données de dev.
 */
export const db = new PrismaClient({
	datasources: { db: { url: process.env.DATABASE_URL } },
	log: ['error']
});

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

/**
 * Déchiffre une charge AES-128-GCM produite par `src/lib/lucia/encryption.ts`.
 * Le module applicatif n'est pas réutilisable ici car il dépend de
 * `$env/static/private`, indisponible hors du bundle SvelteKit.
 */
function decryptPayload(payload: Uint8Array): Buffer {
	const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
	const bytes = Buffer.from(payload);

	const iv = bytes.subarray(0, 16);
	const tag = bytes.subarray(bytes.length - 16);
	const ciphertext = bytes.subarray(16, bytes.length - 16);

	const decipher = createDecipheriv('aes-128-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function getUser(email: string) {
	return resilient(() => db.user.findUnique({ where: { email } }));
}

export async function requireUser(email: string) {
	const user = await getUser(email);
	if (!user) throw new Error(`Utilisateur introuvable en base : ${email}`);
	return user;
}

/**
 * Clé TOTP déchiffrée, telle qu'enregistrée après la configuration de la 2FA. */
export async function getTotpKey(email: string): Promise<Uint8Array> {
	const user = await requireUser(email);
	if (!user.totpKey) throw new Error(`Aucune clé TOTP enregistrée pour ${email}`);
	return new Uint8Array(decryptPayload(user.totpKey));
}

/** Code de récupération en clair, généré à la création du compte. */
export async function getRecoveryCode(email: string): Promise<string> {
	const user = await requireUser(email);
	if (!user.recoveryCode) throw new Error(`Aucun code de récupération pour ${email}`);
	return decryptPayload(Buffer.from(user.recoveryCode, 'base64')).toString('utf-8');
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
	await resilient(() => db.user.create({ data: { email } }));
}

/** Passe un compte au rôle administrateur. Le rôle est relu à chaque requête. */
export async function promoteToAdmin(email: string) {
	await resilient(() => db.user.update({ where: { email }, data: { role: 'ADMIN' } }));
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
	}
) {
	return resilient(() =>
		db.promoCode.create({
			data: {
				code,
				type: overrides?.type ?? 'PERCENTAGE',
				value: overrides?.value ?? 10,
				minAmount: overrides?.minAmount ?? null,
				usageLimit: overrides?.usageLimit ?? null,
				usageCount: overrides?.usageCount ?? 0,
				expiresAt: overrides?.expiresAt ?? null,
				active: overrides?.active ?? true
			}
		})
	);
}

export async function deletePromoCode(id: string) {
	await resilient(async () => {
		await db.promoCode.deleteMany({ where: { id } });
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
	return resilient(() => db.promoCode.findUnique({ where: { id } }));
}

/** Catalogue : produit de test isolé (image factice, pas d'upload Cloudinary). */
export async function createCatalogProduct(overrides?: { name?: string; slug?: string }) {
	const stamp = `${Date.now()}`;
	const category = await resilient(() =>
		db.category.create({ data: { name: `e2e-cat-${stamp}` } })
	);
	const product = await resilient(() =>
		db.product.create({
			data: {
				name: overrides?.name ?? `e2e-prod-${stamp}`,
				slug: overrides?.slug ?? `e2e-prod-${stamp}`,
				description: 'Produit de test e2e pour le catalogue.',
				price: 12.5,
				stock: 10,
				images: ['https://example.test/e2e-product.jpg'],
				colorProduct: '#112233',
				categories: { create: { categoryId: category.id } }
			}
		})
	);
	return { product, category };
}

export async function getProductBySlug(slug: string) {
	return resilient(() => db.product.findUnique({ where: { slug } }));
}

export async function getProductById(id: string) {
	return resilient(() => db.product.findUnique({ where: { id } }));
}

export async function getProductByName(name: string) {
	return resilient(() => db.product.findFirst({ where: { name } }));
}

/** Blog : article de test isolé (auteur + catégorie dédiés). */
export async function createBlogPost(overrides?: {
	title?: string;
	slug?: string;
	published?: boolean;
}) {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const author = await resilient(() =>
		db.blogAuthor.create({ data: { name: `e2e-blog-author-${stamp}` } })
	);
	const category = await resilient(() =>
		db.blogCategory.create({
			data: { name: `e2e-blog-cat-${stamp}`, description: 'Catégorie de test e2e.' }
		})
	);
	const post = await resilient(() =>
		db.blogPost.create({
			data: {
				title: overrides?.title ?? `e2e-post-${stamp}`,
				slug: overrides?.slug ?? `e2e-post-${stamp}`,
				content: '<p>Contenu de test e2e pour le blog.</p>',
				published: overrides?.published ?? true,
				authorId: author.id,
				categoryId: category.id
			}
		})
	);
	return { post, author, category };
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

	await resilient(() => db.blogPostTag.deleteMany({ where: { postId } }));
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

	if (post.categoryId) {
		const remainingForCategory = await resilient(() =>
			db.blogPost.count({ where: { categoryId: post.categoryId } })
		);
		if (remainingForCategory === 0) {
			await resilient(() =>
				db.blogCategory.deleteMany({
					where: { id: post.categoryId, name: { startsWith: 'e2e-blog-cat-' } }
				})
			);
		}
	}
}

/** Relie un produit à une commande, pour vérifier le refus de suppression. */
export async function linkProductToOrder(userId: string, productId: string) {
	const order = await resilient(() => db.order.create({ data: { userId } }));
	const item = await resilient(() =>
		db.orderItem.create({
			data: { orderId: order.id, productId, quantity: 1, price: 1 }
		})
	);
	return { order, item };
}

export async function deleteCatalogProduct(productId: string) {
	const product = await resilient(() =>
		db.product.findUnique({
			where: { id: productId },
			include: { categories: true }
		})
	);
	if (!product) return;

	await resilient(() => db.orderItem.deleteMany({ where: { productId } }));
	await resilient(() => db.productCategory.deleteMany({ where: { productId } }));
	await resilient(() => db.product.deleteMany({ where: { id: productId } }));

	for (const link of product.categories) {
		const remaining = await resilient(() =>
			db.productCategory.count({ where: { categoryId: link.categoryId } })
		);
		if (remaining === 0) {
			await resilient(() =>
				db.category.deleteMany({
					where: { id: link.categoryId, name: { startsWith: 'e2e-cat-' } }
				})
			);
		}
	}
}

/** Nombre de sessions actives, pour vérifier révocations et déconnexions. */
export async function countSessions(email: string): Promise<number> {
	const user = await requireUser(email);
	return resilient(() => db.session.count({ where: { userId: user.id } }));
}

/**
 * Nettoyage en fin de test.
 *
 * Les commandes doivent partir en premier : l'application crée un panier
 * (commande au statut PENDING) dès qu'un utilisateur authentifié charge une
 * page, et la relation `Order → User` est en `Restrict`. Le reste (sessions,
 * demandes de vérification, sessions de réinitialisation) part en cascade.
 */
export async function getPendingOrder(userId: string) {
	return resilient(() =>
		db.order.findFirst({
			where: { userId, status: 'PENDING' },
			include: { items: true }
		})
	);
}

export async function getOrderById(orderId: string) {
	return resilient(() =>
		db.order.findUnique({
			where: { id: orderId },
			include: { items: true }
		})
	);
}

export async function attachOrderAddress(orderId: string, addressId: string) {
	return resilient(() =>
		db.order.update({
			where: { id: orderId },
			data: {
				addressId,
				shippingOption: 'no_shipping',
				shippingCost: 0
			}
		})
	);
}

export async function getTransactionByStripePaymentId(stripePaymentId: string) {
	return resilient(() =>
		db.transaction.findUnique({
			where: { stripePaymentId }
		})
	);
}

export async function findAddressesByUserId(userId: string) {
	return resilient(() => db.address.findMany({ where: { userId } }));
}

export async function findAddressById(id: string) {
	return resilient(() => db.address.findUnique({ where: { id } }));
}

export async function createCatalogCategory() {
	return resilient(() => db.category.create({ data: { name: `e2e-cat-${Date.now()}` } }));
}

export async function deleteCatalogCategory(id: string) {
	await resilient(() =>
		db.category.deleteMany({ where: { id, name: { startsWith: 'e2e-cat-' } } })
	);
}

export async function createUserAddress(userId: string) {
	return resilient(() =>
		db.address.create({
			data: {
				userId,
				first_name: 'E2e',
				last_name: 'Tester',
				phone: '+33600000000',
				street_number: '1',
				street: 'Rue des Tests',
				city: 'Toulouse',
				county: 'Haute-Garonne',
				state: 'Occitanie',
				stateLetter: 'FR',
				state_code: 'OC',
				zip: '31000',
				country: 'France',
				country_code: 'FR',
				ISO_3166_1_alpha_3: 'FRA',
				type: 'SHIPPING'
			}
		})
	);
}

/** Paiement simulé : Transaction + Order PAID, sans Stripe. */
export async function simulatePaidOrder(orderId: string, userId: string, email: string) {
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
				shippingOption: 'no_shipping',
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
				address_type: 'SHIPPING',
				products: []
			}
		})
	);
	await resilient(() => db.order.update({ where: { id: orderId }, data: { status: 'PAID' } }));
	return transaction;
}

export async function getTransactionById(id: string) {
	return resilient(() => db.transaction.findUnique({ where: { id } }));
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
