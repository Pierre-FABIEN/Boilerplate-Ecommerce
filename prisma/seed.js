import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { createCipheriv, randomBytes } from 'crypto';
import { decodeBase64 } from '@oslojs/encoding';
import dotenv from 'dotenv';
import { blog } from './seed-data/blog.js'; // BLOG-PLUGIN

dotenv.config();

if (!process.env.ENCRYPTION_KEY) {
	throw new Error('ENCRYPTION_KEY is not defined in the environment variables.');
}

// Ce script insère un jeu de données de démonstration : comptes avec un mot
// de passe partagé et connu (voir DEMO_PASSWORD), produits fictifs... Rien de
// tout ça n'a sa place dans un environnement de production réel. `VERCEL_ENV`
// est posé automatiquement par Vercel (jamais en local) — un run local avec
// des identifiants de prod dans `.env` reste possible, ce garde-fou ne couvre
// que le cas où ce script serait, par erreur, câblé dans un déploiement.
if (process.env.VERCEL_ENV === 'production' && process.env.FORCE_SEED !== '1') {
	throw new Error(
		'npm run seed refusé en production (VERCEL_ENV=production). ' +
			'Si c’est volontaire, relancez avec FORCE_SEED=1.'
	);
}

const key = decodeBase64(process.env.ENCRYPTION_KEY);
const prisma = new PrismaClient();

/**
 * Mot de passe commun aux comptes email de démonstration — surchargeable
 * (`SEED_DEMO_PASSWORD`) pour ne pas dépendre d'une valeur en dur connue de
 * quiconque lit ce fichier, si ce jeu de données sert au-delà d'un poste de
 * dev local.
 */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass!2026';

const ARGON2 = {
	memoryCost: 19456,
	timeCost: 2,
	outputLen: 32,
	parallelism: 1
};

// AES-256-GCM (`encryptionVersion` 2) — même schéma que `$lib/lucia/encryption.ts`.
const encrypt = (data) => {
	const iv = randomBytes(16);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, ciphertext, tag]);
};

const generateRecoveryCode = () => Math.floor(10000000 + Math.random() * 90000000).toString();

// Parrainage : même alphabet que `generateUniqueReferralCode` côté app, une
// simple collision improbable suffit pour un jeu de données de démo.
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateReferralCode = () => {
	const bytes = randomBytes(8);
	let code = '';
	for (let i = 0; i < 8; i++) {
		code += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
	}
	return code;
};

const money = (value) => parseFloat(Number(value).toFixed(2));

const vatFromTtc = (ttc) => {
	const total = money(ttc);
	const subtotal = money(total / 1.2);
	return { subtotal, tax: money(total - subtotal), total };
};

const atUtc = (year, monthIndex, day, hour = 10) =>
	new Date(Date.UTC(year, monthIndex, day, hour, 15, 0));

const ADMIN_EMAIL = 'admin@madeindiamonds.com'; // ADMIN-PLUGIN : compte de démonstration

// PRODUCT-PLUGIN : taxonomies de démonstration (système générique, remplace Material/Category).
// « Matière » reste mono-valeur (multiple: false), « Catégorie » multi-valeur (multiple: true) —
// mêmes règles métier qu'avant la généralisation.
const TAXONOMIES = [
	{
		name: 'Matière',
		slug: 'matiere',
		type: 'TEXT',
		multiple: false,
		values: ['Numérique', 'Papier']
	},
	{
		name: 'Catégorie',
		slug: 'categorie',
		type: 'TEXT',
		multiple: true,
		values: ['Sites web', 'Identité', 'Applications']
	}
];

const PRODUCTS = [
	{
		name: 'Site vitrine',
		slug: 'site-vitrine',
		colorProduct: '#844c6d',
		category: 'Sites web',
		material: 'Numérique',
		price: 2900,
		stock: 24,
		weight: 0.3,
		length: 32,
		width: 24,
		height: 3,
		image:
			'https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=800&q=80',
		description:
			'Site vitrine sur-mesure : cadrage, design, développement SvelteKit et mise en ligne. Idéal pour poser une marque en ligne.'
	},
	{
		name: 'E-commerce',
		slug: 'e-commerce',
		colorProduct: '#ec008c',
		category: 'Sites web',
		material: 'Numérique',
		price: 5900,
		stock: 12,
		weight: 0.3,
		length: 32,
		width: 24,
		height: 3,
		image:
			'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80',
		description:
			'Boutique en ligne : catalogue, panier, paiement et back-office. Pensée pour vendre sans friction, y compris sur mobile.'
	},
	{
		name: 'Identité visuelle',
		slug: 'identite-visuelle',
		colorProduct: '#74c92b',
		category: 'Identité',
		material: 'Papier',
		price: 1800,
		stock: 30,
		weight: 0.5,
		length: 32,
		width: 24,
		height: 5,
		image:
			'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80',
		description:
			'Direction artistique, logotype, typographies et charte. Un langage visuel que le site et les supports peuvent porter au quotidien.'
	},
	{
		name: 'Application web',
		slug: 'application-web',
		colorProduct: '#f68712',
		category: 'Applications',
		material: 'Numérique',
		price: 12000,
		stock: 6,
		weight: 0.3,
		length: 32,
		width: 24,
		height: 3,
		image:
			'https://images.unsplash.com/photo-1551650975-87deedd944c8?auto=format&fit=crop&w=800&q=80',
		description:
			'Outil métier sur-mesure : authentification, données, parcours. Un produit, pas un assemblage de templates.'
	},
	{
		name: 'Maintenance',
		slug: 'maintenance',
		colorProduct: '#00adef',
		category: 'Applications',
		material: null,
		price: 960,
		stock: 40,
		weight: 0.2,
		length: 30,
		width: 22,
		height: 2,
		image:
			'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=800&q=80',
		description:
			'Suivi annuel : mises à jour, sauvegardes, petites évolutions et astreinte. Pour un site qui reste vivant après la mise en ligne.'
	}
];

const PARIS = {
	city: 'Paris',
	county: 'Paris',
	state: 'Île-de-France',
	stateLetter: 'IDF',
	state_code: 'IDF',
	zip: '75011',
	country: 'France',
	country_code: 'FR',
	ISO_3166_1_alpha_3: 'FRA'
};

const LYON = {
	city: 'Lyon',
	county: 'Rhône',
	state: 'Auvergne-Rhône-Alpes',
	stateLetter: 'ARA',
	state_code: 'ARA',
	zip: '69002',
	country: 'France',
	country_code: 'FR',
	ISO_3166_1_alpha_3: 'FRA'
};

const NO_SHIPPING = {
	shippingOption: 'no_shipping',
	shippingCost: 0,
	shippingMethodId: 0,
	shippingMethodName: 'Livraison numérique'
};

const RELAY = {
	shippingOption: 'mondialrelay/point-relais',
	shippingCost: 4.9,
	shippingMethodId: 8,
	shippingMethodName: 'Mondial Relay — Point relais',
	servicePointId: 'FR-75011-00123',
	servicePointPostNumber: '12345',
	servicePointLatitude: '48.865',
	servicePointLongitude: '2.378',
	servicePointType: 'service_point',
	servicePointExtraRefCab: 'MID-CAB-001',
	servicePointExtraShopRef: 'SHOP-11-BERANGER'
};

const PACKAGE = {
	package_length: 32,
	package_width: 24,
	package_height: 8,
	package_dimension_unit: 'cm',
	package_weight: 1.2,
	package_weight_unit: 'kg',
	package_volume: 6144,
	package_volume_unit: 'cm3'
};

/**
 * Vide toutes les tables. L'ordre suit les dépendances de clés étrangères :
 * les cascades ne couvrent pas les relations en Restrict (orders → users,
 * order_items → products, blog_posts → blog_authors).
 */
async function truncate() {
	await prisma.$transaction([
		prisma.blogPostTaxonomyValue.deleteMany(), // BLOG-PLUGIN
		prisma.blogPostTag.deleteMany(), // BLOG-PLUGIN
		prisma.blogComment.deleteMany(), // BLOG-PLUGIN
		prisma.blogPost.deleteMany(), // BLOG-PLUGIN
		prisma.blogTaxonomyValue.deleteMany(), // BLOG-PLUGIN
		prisma.blogTaxonomy.deleteMany(), // BLOG-PLUGIN
		prisma.blogCategory.deleteMany(), // BLOG-PLUGIN
		prisma.blogAuthor.deleteMany(), // BLOG-PLUGIN
		prisma.blogTag.deleteMany(), // BLOG-PLUGIN
		prisma.custom.deleteMany(),
		prisma.orderStatusHistory.deleteMany(),
		prisma.orderItem.deleteMany(),
		prisma.transaction.deleteMany(), // COMMERCE-PLUGIN
		prisma.order.deleteMany(), // COMMERCE-PLUGIN
		prisma.address.deleteMany(),
		prisma.wishlistItem.deleteMany(), // PRODUCT-PLUGIN
		prisma.review.deleteMany(), // PRODUCT-PLUGIN
		prisma.productCategory.deleteMany(),
		prisma.productTaxonomyValue.deleteMany(), // PRODUCT-PLUGIN
		prisma.product.deleteMany(),
		prisma.category.deleteMany(),
		prisma.material.deleteMany(), // PRODUCT-PLUGIN
		prisma.taxonomyValue.deleteMany(), // PRODUCT-PLUGIN
		prisma.taxonomy.deleteMany(), // PRODUCT-PLUGIN
		prisma.promoCode.deleteMany(), // PROMO-PLUGIN
		prisma.contactSubmission.deleteMany(), // CONTACT-PLUGIN
		prisma.adminAuditLog.deleteMany(), // ADMIN-PLUGIN
		prisma.storeSettings.deleteMany(), // ADMIN-PLUGIN
		prisma.session.deleteMany(),
		prisma.emailVerificationRequest.deleteMany(),
		prisma.passwordResetSession.deleteMany(),
		prisma.user.deleteMany()
	]);
}

async function createDemoUser({
	email,
	username,
	name,
	role,
	emailVerified,
	isMfaEnabled,
	googleId,
	picture,
	createdAt,
	passwordHash
}) {
	const recoveryCode = generateRecoveryCode();
	return prisma.user.create({
		data: {
			email,
			username,
			name,
			role,
			emailVerified,
			isMfaEnabled: Boolean(isMfaEnabled),
			googleId: googleId ?? null,
			picture: picture ?? null,
			passwordHash: googleId ? null : passwordHash,
			totpKey: Buffer.from(encrypt(randomBytes(32))),
			recoveryCode: encrypt(Buffer.from(recoveryCode, 'utf-8')).toString('base64'),
			encryptionVersion: 2,
			referralCode: generateReferralCode(),
			createdAt
		}
	});
}

function snapshotProducts(items) {
	return items.map((item) => ({
		id: item.productId,
		name: item.product.name,
		price: item.price,
		quantity: item.quantity,
		description: item.product.description,
		stock: item.product.stock,
		images: item.product.images,
		customizations: (item.custom ?? []).map((entry) => ({
			id: entry.id,
			image: entry.image,
			userMessage: entry.userMessage,
			createdAt: entry.createdAt,
			updatedAt: entry.updatedAt
		}))
	}));
}

async function createPaidFlow({
	user,
	address,
	status,
	createdAt,
	history,
	lines,
	shipping = NO_SHIPPING,
	promoCode = null,
	discountAmount = 0,
	stripePaymentId,
	transactionStatus = 'paid',
	custom = null,
	tracking = null
}) {
	const merchandise = money(
		lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
	);
	const shippingCost = money(shipping.shippingCost ?? 0);
	const totals = vatFromTtc(merchandise - discountAmount + shippingCost);

	const order = await prisma.order.create({
		data: {
			userId: user.id,
			shippingAddressId: address.id,
			billingAddressId: address.id,
			status,
			promoCode,
			discountAmount,
			subtotal: totals.subtotal,
			tax: totals.tax,
			total: totals.total,
			shippingOption: shipping.shippingOption,
			shippingCost,
			servicePointId: shipping.servicePointId ?? null,
			servicePointPostNumber: shipping.servicePointPostNumber ?? null,
			servicePointLatitude: shipping.servicePointLatitude ?? null,
			servicePointLongitude: shipping.servicePointLongitude ?? null,
			servicePointType: shipping.servicePointType ?? null,
			servicePointExtraRefCab: shipping.servicePointExtraRefCab ?? null,
			servicePointExtraShopRef: shipping.servicePointExtraShopRef ?? null,
			createdAt,
			updatedAt: createdAt,
			items: {
				create: lines.map((line) => ({
					productId: line.product.id,
					quantity: line.quantity,
					price: line.product.price,
					createdAt,
					updatedAt: createdAt,
					...(custom
						? {
								custom: {
									create: {
										image: custom.image,
										userMessage: custom.userMessage,
										createdAt,
										updatedAt: createdAt
									}
								}
							}
						: {})
				}))
			},
			statusHistory: {
				create: history.map((entry) => ({
					status: entry.status,
					changedAt: entry.changedAt
				}))
			}
		},
		include: {
			items: { include: { product: true, custom: true } }
		}
	});

	const needsTransaction = status === 'PAID' || status === 'SHIPPED';
	if (!needsTransaction) {
		return order;
	}

	await prisma.transaction.create({
		data: {
			stripePaymentId,
			orderId: order.id,
			userId: user.id,
			amount: totals.total,
			currency: 'eur',
			customer_details_email: user.email,
			customer_details_name: user.name,
			customer_details_phone: address.phone,
			status: transactionStatus,
			createdAt,
			updatedAt: createdAt,
			shippingOption: shipping.shippingOption,
			shippingCost,
			shippingMethodId: shipping.shippingMethodId ?? 0,
			shippingMethodName: shipping.shippingMethodName ?? shipping.shippingOption,
			sendcloudParcelId: tracking?.sendcloudParcelId ?? null,
			trackingNumber: tracking?.trackingNumber ?? null,
			trackingUrl: tracking?.trackingUrl ?? null,
			...PACKAGE,
			address_first_name: address.first_name,
			address_last_name: address.last_name,
			address_phone: address.phone,
			address_company: address.company,
			address_street_number: address.street_number,
			address_street: address.street,
			address_city: address.city,
			address_county: address.county,
			address_state: address.state,
			address_stateLetter: address.stateLetter,
			address_state_code: address.state_code,
			address_zip: address.zip,
			address_country: address.country,
			address_country_code: address.country_code,
			address_ISO_3166_1_alpha_3: address.ISO_3166_1_alpha_3,
			billing_first_name: address.first_name,
			billing_last_name: address.last_name,
			billing_phone: address.phone,
			billing_company: address.company,
			billing_street_number: address.street_number,
			billing_street: address.street,
			billing_city: address.city,
			billing_county: address.county,
			billing_state: address.state,
			billing_stateLetter: address.stateLetter,
			billing_state_code: address.state_code,
			billing_zip: address.zip,
			billing_country: address.country,
			billing_country_code: address.country_code,
			billing_ISO_3166_1_alpha_3: address.ISO_3166_1_alpha_3,
			servicePointId: shipping.servicePointId ?? null,
			servicePointPostNumber: shipping.servicePointPostNumber ?? null,
			servicePointLatitude: shipping.servicePointLatitude ?? null,
			servicePointLongitude: shipping.servicePointLongitude ?? null,
			servicePointType: shipping.servicePointType ?? null,
			servicePointExtraRefCab: shipping.servicePointExtraRefCab ?? null,
			servicePointExtraShopRef: shipping.servicePointExtraShopRef ?? null,
			products: snapshotProducts(order.items)
		}
	});

	return order;
}

async function main() {
	console.log('Nettoyage de la base…');
	await truncate();

	const passwordHash = await hash(DEMO_PASSWORD, ARGON2);

	const adminUser = await createDemoUser({
		email: ADMIN_EMAIL,
		username: 'Admin',
		name: 'Admin Studio',
		role: 'ADMIN',
		emailVerified: true,
		isMfaEnabled: false,
		createdAt: atUtc(2026, 0, 8),
		passwordHash
	});

	const lea = await createDemoUser({
		email: 'lea@atelier-nord.fr',
		username: 'lea-martin',
		name: 'Léa Martin',
		role: 'CLIENT',
		emailVerified: true,
		isMfaEnabled: false,
		createdAt: atUtc(2026, 4, 12),
		passwordHash
	});

	const marc = await createDemoUser({
		email: 'marc.durand@example.com',
		username: 'marc-durand',
		name: 'Marc Durand',
		role: 'CLIENT',
		emailVerified: true,
		isMfaEnabled: true,
		createdAt: atUtc(2026, 5, 3),
		passwordHash
	});

	const claire = await createDemoUser({
		email: 'claire.morel@gmail.com',
		username: null,
		name: 'Claire Morel',
		role: 'CLIENT',
		emailVerified: true,
		isMfaEnabled: false,
		googleId: 'google-oauth-demo-claire',
		picture:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=128&q=80',
		createdAt: atUtc(2026, 6, 18),
		passwordHash
	});

	const nina = await createDemoUser({
		email: 'nina.petit@example.com',
		username: 'nina-petit',
		name: 'Nina Petit',
		role: 'CLIENT',
		emailVerified: false,
		isMfaEnabled: false,
		createdAt: atUtc(2026, 7, 19),
		passwordHash
	});

	await prisma.emailVerificationRequest.create({
		data: {
			id: 'seed_email_verify_nina',
			userId: nina.id,
			email: nina.email,
			code: '84729103',
			expiresAt: atUtc(2026, 7, 20, 12),
			createdAt: atUtc(2026, 7, 19, 11)
		}
	});

	console.log('5 comptes créés (1 admin, 4 clients).');

	const leaShipping = await prisma.address.create({
		data: {
			userId: lea.id,
			first_name: 'Léa',
			last_name: 'Martin',
			phone: '+33645127890',
			company: 'Atelier Nord',
			street_number: '18',
			street: 'Rue de la Folie-Méricourt',
			createdAt: atUtc(2026, 4, 12, 11),
			...PARIS
		}
	});

	await prisma.address.create({
		data: {
			userId: lea.id,
			first_name: 'Léa',
			last_name: 'Martin',
			phone: '+33645127890',
			company: 'Atelier Nord',
			street_number: '18',
			street: 'Rue de la Folie-Méricourt',
			createdAt: atUtc(2026, 4, 12, 11),
			...PARIS
		}
	});

	const marcShipping = await prisma.address.create({
		data: {
			userId: marc.id,
			first_name: 'Marc',
			last_name: 'Durand',
			phone: '+33788901234',
			company: 'Durand Conseil',
			street_number: '4',
			street: 'Place des Jacobins',
			createdAt: atUtc(2026, 5, 4),
			...LYON
		}
	});

	const claireShipping = await prisma.address.create({
		data: {
			userId: claire.id,
			first_name: 'Claire',
			last_name: 'Morel',
			phone: '+33612004567',
			street_number: '9',
			street: 'Rue des Archives',
			createdAt: atUtc(2026, 6, 18, 12),
			...PARIS,
			zip: '75004'
		}
	});

	console.log('4 adresses créées (Léa livraison/facturation, Marc, Claire).');

	// slug de taxonomie -> Map<value, taxonomyValueId>
	const taxonomyValueIdsBySlug = new Map();
	let taxonomyValueCount = 0;
	for (const taxonomy of TAXONOMIES) {
		const created = await prisma.taxonomy.create({
			data: {
				name: taxonomy.name,
				slug: taxonomy.slug,
				type: taxonomy.type,
				multiple: taxonomy.multiple
			}
		});
		const valueIds = new Map();
		for (const value of taxonomy.values) {
			const createdValue = await prisma.taxonomyValue.create({
				data: { taxonomyId: created.id, value, label: value }
			});
			valueIds.set(value, createdValue.id);
		}
		taxonomyValueIdsBySlug.set(taxonomy.slug, valueIds);
		taxonomyValueCount += valueIds.size;
	}

	const productsBySlug = new Map();
	for (const product of PRODUCTS) {
		const taxonomyValueIds = [
			taxonomyValueIdsBySlug.get('categorie').get(product.category),
			...(product.material ? [taxonomyValueIdsBySlug.get('matiere').get(product.material)] : [])
		];
		const created = await prisma.product.create({
			data: {
				name: product.name,
				description: product.description,
				price: product.price,
				stock: product.stock,
				weight: product.weight ?? null,
				length: product.length ?? null,
				width: product.width ?? null,
				height: product.height ?? null,
				images: [product.image],
				slug: product.slug,
				colorProduct: product.colorProduct,
				taxonomyValues: {
					create: taxonomyValueIds.map((taxonomyValueId) => ({ taxonomyValueId }))
				}
			}
		});
		productsBySlug.set(product.slug, created);
	}
	console.log(
		`${PRODUCTS.length} produits, ${TAXONOMIES.length} taxonomies et ${taxonomyValueCount} valeurs créés.`
	);

	const vitrine = productsBySlug.get('site-vitrine');
	const ecommerce = productsBySlug.get('e-commerce');
	const identite = productsBySlug.get('identite-visuelle');
	const app = productsBySlug.get('application-web');
	const maintenance = productsBySlug.get('maintenance');

	await prisma.promoCode.createMany({
		data: [
			{
				code: 'WELCOME10',
				type: 'PERCENTAGE',
				value: 10,
				minAmount: 20,
				usageCount: 1,
				active: true
			},
			{
				code: 'FIXED5',
				type: 'FIXED',
				value: 5,
				minAmount: 30,
				usageLimit: 100,
				usageCount: 12,
				active: true
			},
			{
				code: 'SUMMER25',
				type: 'PERCENTAGE',
				value: 25,
				minAmount: 1000,
				expiresAt: atUtc(2026, 6, 31),
				active: true
			},
			{
				code: 'STUDIO50',
				type: 'FIXED',
				value: 50,
				minAmount: 500,
				usageLimit: 10,
				usageCount: 10,
				active: true
			},
			{
				code: 'OLDLAUNCH',
				type: 'PERCENTAGE',
				value: 15,
				active: false
			}
		]
	});
	console.log('5 codes promo créés (actif, utilisé, expiré, épuisé, inactif).');

	await createPaidFlow({
		user: lea,
		address: leaShipping,
		status: 'PAID',
		createdAt: atUtc(2026, 6, 22, 9),
		history: [
			{ status: 'PENDING', changedAt: atUtc(2026, 6, 21, 16) },
			{ status: 'PAID', changedAt: atUtc(2026, 6, 22, 9) }
		],
		lines: [{ product: vitrine, quantity: 1 }],
		stripePaymentId: 'cs_seed_july_vitrine'
	});

	await createPaidFlow({
		user: lea,
		address: leaShipping,
		status: 'PAID',
		createdAt: atUtc(2026, 7, 3, 11),
		history: [
			{ status: 'PENDING', changedAt: atUtc(2026, 7, 2, 18) },
			{ status: 'PAID', changedAt: atUtc(2026, 7, 3, 11) }
		],
		lines: [{ product: identite, quantity: 1 }],
		stripePaymentId: 'cs_seed_aug_identite',
		custom: {
			image:
				'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
			userMessage: 'Reprendre le monogramme AN, or et ivoire, pour la papeterie et le site.'
		}
	});

	const welcomeDiscount = money(ecommerce.price * 0.1);
	await createPaidFlow({
		user: lea,
		address: leaShipping,
		status: 'SHIPPED',
		createdAt: atUtc(2026, 7, 12, 14),
		history: [
			{ status: 'PENDING', changedAt: atUtc(2026, 7, 11, 10) },
			{ status: 'PAID', changedAt: atUtc(2026, 7, 12, 14) },
			{ status: 'SHIPPED', changedAt: atUtc(2026, 7, 14, 8) }
		],
		lines: [{ product: ecommerce, quantity: 1 }],
		shipping: RELAY,
		promoCode: 'WELCOME10',
		discountAmount: welcomeDiscount,
		stripePaymentId: 'cs_seed_aug_ecommerce',
		tracking: {
			sendcloudParcelId: 884512,
			trackingNumber: 'MR123456789FR',
			trackingUrl: 'https://www.mondialrelay.fr/suivi-de-colis/?numero=MR123456789FR'
		}
	});

	await createPaidFlow({
		user: marc,
		address: marcShipping,
		status: 'PAID',
		createdAt: atUtc(2026, 7, 18, 16),
		history: [
			{ status: 'PENDING', changedAt: atUtc(2026, 7, 17, 9) },
			{ status: 'PAID', changedAt: atUtc(2026, 7, 18, 16) }
		],
		lines: [{ product: app, quantity: 1 }],
		stripePaymentId: 'cs_seed_aug_app'
	});

	await createPaidFlow({
		user: marc,
		address: marcShipping,
		status: 'PAID',
		createdAt: atUtc(2026, 7, 21, 10),
		history: [
			{ status: 'PENDING', changedAt: atUtc(2026, 7, 20, 19) },
			{ status: 'PAID', changedAt: atUtc(2026, 7, 21, 10) }
		],
		lines: [{ product: maintenance, quantity: 1 }],
		stripePaymentId: 'cs_seed_aug_maintenance'
	});

	await createPaidFlow({
		user: claire,
		address: claireShipping,
		status: 'CANCELLED',
		createdAt: atUtc(2026, 7, 8, 13),
		history: [
			{ status: 'PENDING', changedAt: atUtc(2026, 7, 8, 13) },
			{ status: 'CANCELLED', changedAt: atUtc(2026, 7, 9, 9) }
		],
		lines: [{ product: vitrine, quantity: 1 }]
	});

	await prisma.order.create({
		data: {
			userId: lea.id,
			shippingAddressId: leaShipping.id,
			billingAddressId: leaShipping.id,
			status: 'PENDING',
			...vatFromTtc(maintenance.price),
			shippingOption: 'no_shipping',
			shippingCost: 0,
			createdAt: atUtc(2026, 7, 22, 15),
			items: {
				create: {
					productId: maintenance.id,
					quantity: 1,
					price: maintenance.price
				}
			},
			statusHistory: {
				create: { status: 'PENDING', changedAt: atUtc(2026, 7, 22, 15) }
			}
		}
	});

	console.log('6 commandes créées (panier, payée, expédiée, annulée) + 5 transactions.');

	await prisma.review.createMany({
		data: [
			{
				productId: vitrine.id,
				userId: lea.id,
				rating: 5,
				comment: 'Livré dans les temps, exactement le rendu qu’on voulait.',
				createdAt: atUtc(2026, 6, 25)
			},
			{
				productId: ecommerce.id,
				userId: lea.id,
				rating: 4,
				comment: 'Très bon accompagnement, quelques retouches mineures après la mise en ligne.',
				createdAt: atUtc(2026, 7, 16)
			},
			{
				productId: app.id,
				userId: marc.id,
				rating: 5,
				comment: 'Application robuste, l’équipe a bien cadré le besoin métier.',
				createdAt: atUtc(2026, 7, 20)
			}
		]
	});
	console.log('3 avis produit créés.');

	await prisma.wishlistItem.createMany({
		data: [
			{ userId: claire.id, productId: maintenance.id, createdAt: atUtc(2026, 7, 9) },
			{ userId: nina.id, productId: ecommerce.id, createdAt: atUtc(2026, 7, 19, 12) }
		]
	});
	console.log('2 lignes de liste d’envies créées.');

	await prisma.storeSettings.create({
		data: { wishlistEnabled: true, crossSellEnabled: true }
	});
	console.log('Réglages boutique créés (liste d’envies et ventes croisées activées).');

	const studioAuthor = await prisma.blogAuthor.create({
		data: { name: adminUser.name ?? 'Admin Studio' }
	});
	const camilleAuthor = await prisma.blogAuthor.create({
		data: { name: 'Camille — direction artistique' }
	});

	// BLOG-PLUGIN : taxonomies génériques (voir docs/blog/README.md).
	const categoryTaxonomy = await prisma.blogTaxonomy.create({
		data: { name: 'Catégorie', slug: 'categorie', multiple: false }
	});
	const tagTaxonomy = await prisma.blogTaxonomy.create({
		data: { name: 'Tag', slug: 'tag', multiple: true }
	});

	const studioCategory = await prisma.blogTaxonomyValue.create({
		data: { taxonomyId: categoryTaxonomy.id, value: 'Studio' }
	});
	const methodCategory = await prisma.blogTaxonomyValue.create({
		data: { taxonomyId: categoryTaxonomy.id, value: 'Méthode' }
	});

	const tagDesign = await prisma.blogTaxonomyValue.create({
		data: { taxonomyId: tagTaxonomy.id, value: 'Design' }
	});
	const tagTech = await prisma.blogTaxonomyValue.create({
		data: { taxonomyId: tagTaxonomy.id, value: 'Technique' }
	});
	const tagCulture = await prisma.blogTaxonomyValue.create({
		data: { taxonomyId: tagTaxonomy.id, value: 'Culture' }
	});

	const parseBlogDate = (value) => {
		const [day, month, yearRaw] = String(value).split('.');
		const year = Number(yearRaw) < 100 ? 2000 + Number(yearRaw) : Number(yearRaw);
		return new Date(Date.UTC(year, Number(month) - 1, Number(day), 9, 0, 0));
	};

	const createdPosts = [];
	for (const [index, article] of blog.entries()) {
		const createdAt = parseBlogDate(article.date);
		const post = await prisma.blogPost.create({
			data: {
				title: article.title,
				content: article.content,
				slug: article.link,
				published: true,
				authorId: index % 3 === 1 ? camilleAuthor.id : studioAuthor.id,
				createdAt,
				updatedAt: createdAt,
				taxonomyValues: {
					create: [
						{ taxonomyValueId: index >= 4 ? methodCategory.id : studioCategory.id },
						{ taxonomyValueId: tagCulture.id },
						...(index % 2 === 0
							? [{ taxonomyValueId: tagDesign.id }]
							: [{ taxonomyValueId: tagTech.id }])
					]
				}
			}
		});
		createdPosts.push(post);
	}

	await prisma.blogPost.create({
		data: {
			title: 'Brouillon : refonte de madeindiamonds.com',
			slug: 'brouillon-refonte-studio',
			published: false,
			authorId: studioAuthor.id,
			taxonomyValues: { create: { taxonomyValueId: methodCategory.id } },
			createdAt: atUtc(2026, 7, 20),
			content: `
				<p>Notes internes : revoir la homepage, le parcours Offres et le cas client sportif.</p>
				<p>Ce brouillon n’est pas publié — il n’apparaît que dans l’admin.</p>
			`
		}
	});

	await prisma.blogComment.createMany({
		data: [
			{
				postId: createdPosts[0].id,
				author: 'Léa Martin',
				content:
					'Clair et précis, exactement le niveau d’exigence qu’on cherchait pour notre vitrine.',
				createdAt: atUtc(2026, 0, 8)
			},
			{
				postId: createdPosts[0].id,
				author: 'Marc Durand',
				content: 'Est-ce que vous accompagnez aussi la rédaction des pages métier ?',
				createdAt: atUtc(2026, 0, 9)
			}
		]
	});

	console.log(`${blog.length} articles publiés, 1 brouillon, 3 tags, 2 commentaires.`);

	await prisma.contactSubmission.createMany({
		data: [
			{
				name: 'Sophie Bernard',
				email: 'sophie.bernard@maison-claire.fr',
				subject: 'Devis site vitrine',
				message:
					'Bonjour, nous ouvrons une maison de création à Nantes et cherchons un site vitrine à l’image de nos pièces. Pouvez-vous proposer un cadrage et un calendrier ?',
				createdAt: atUtc(2026, 7, 5, 9)
			},
			{
				name: 'Julien Lefèvre',
				email: 'julien@nord-retail.com',
				subject: 'Refonte e-commerce',
				message:
					'Notre boutique actuelle est trop lente sur mobile. On voudrait un tunnel plus simple et un back-office utilisable par l’équipe magasin.',
				createdAt: atUtc(2026, 7, 14, 15)
			},
			{
				name: 'Agence Volt',
				email: 'hello@agencevolt.co',
				subject: 'Partenariat',
				message:
					'On cherche un studio technique pour les projets qui dépassent notre pôle interne. Intéressés pour en discuter ?',
				createdAt: atUtc(2026, 7, 21, 11)
			}
		]
	});
	console.log('3 messages de contact créés.');

	console.log('\nComptes de démonstration (mot de passe : ' + DEMO_PASSWORD + ')');
	console.log(`  ${ADMIN_EMAIL}          ADMIN`);
	console.log('  lea@atelier-nord.fr            CLIENT vérifié, panier + factures');
	console.log('  marc.durand@example.com        CLIENT 2FA activée');
	console.log('  claire.morel@gmail.com         CLIENT Google (pas de mot de passe local)');
	console.log('  nina.petit@example.com         CLIENT e-mail non vérifié');
}

main()
	.then(() => console.log('\nSeed terminé.'))
	.catch((error) => {
		console.error('Échec du seed :', error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
