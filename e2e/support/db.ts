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

/** Code promo jetable, pour vérifier qu'un CLIENT ne peut pas le supprimer. */
export async function createPromoCode(code: string) {
	return resilient(() =>
		db.promoCode.create({
			data: { code, type: 'PERCENTAGE', value: 10, active: true }
		})
	);
}

export async function deletePromoCode(id: string) {
	await resilient(async () => {
		await db.promoCode.deleteMany({ where: { id } });
	});
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
export async function deleteUser(email: string) {
	const user = await getUser(email);
	if (!user) return;

	await resilient(() => db.order.deleteMany({ where: { userId: user.id } }));
	await resilient(() => db.user.delete({ where: { id: user.id } }));
}
