import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'crypto';
import { decodeBase64 } from '@oslojs/encoding';
import dotenv from 'dotenv';
import { blog } from './seed-data/blog.js'; // BLOG-PLUGIN

dotenv.config();

if (!process.env.ENCRYPTION_KEY) {
	throw new Error('ENCRYPTION_KEY is not defined in the environment variables.');
}

const key = decodeBase64(process.env.ENCRYPTION_KEY);
const prisma = new PrismaClient();

const encrypt = (data) => {
	const iv = randomBytes(16);
	const cipher = createCipheriv('aes-128-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, ciphertext, tag]);
};

const generateRecoveryCode = () => Math.floor(10000000 + Math.random() * 90000000).toString();

const ADMIN_EMAIL = 'xplicitdrink.dev@gmail.com'; // ADMIN-PLUGIN : compte de démonstration

// Hash Argon2id statique correspondant au mot de passe de démonstration.
const ADMIN_PASSWORD_HASH =
	'$argon2id$v=19$m=19456,t=2,p=1$2h/u9dvpXqr5PiPa19tlBA$ZUYyS8+NjOxTodAaDO1ez5oVToWRfKCQWRabAe8sIgk';

const CATEGORIES = ['Beverages', 'Snacks', 'Desserts']; // PRODUCT-PLUGIN

const PRODUCTS = [
	{
		name: 'Original',
		slug: 'original',
		colorProduct: '#844c6d',
		category: 'Beverages',
		image:
			'https://res.cloudinary.com/dedmxt8ta/image/upload/v1751910825/Xplicitdrink_Original_-_2026-min_hnctpa.png'
	},
	{
		name: 'Dragon',
		slug: 'dragon',
		colorProduct: '#ec008c',
		category: 'Snacks',
		image:
			'https://res.cloudinary.com/dedmxt8ta/image/upload/v1751910825/Xplicitdrink_-_Dragon_-_2026-min_bweo6l.png'
	},
	{
		name: 'Fresh',
		slug: 'fresh',
		colorProduct: '#74c92b',
		category: 'Beverages',
		image:
			'https://res.cloudinary.com/dedmxt8ta/image/upload/v1751910825/Xplicitdrink_-_Fresh_-_2026-min_ika4zh.png'
	},
	{
		name: 'Pulsar',
		slug: 'pulsar',
		colorProduct: '#f68712',
		category: 'Snacks',
		image:
			'https://res.cloudinary.com/dedmxt8ta/image/upload/v1751910825/Xplicitdrink_-_Pulsar_-_2026-min_ej2tcu.png'
	},
	{
		name: 'Wild',
		slug: 'wild',
		colorProduct: '#00adef',
		category: 'Snacks',
		image:
			'https://res.cloudinary.com/dedmxt8ta/image/upload/v1751911954/Xplicitdrink_-_Wild_-_2026-min_tzibxu.png'
	}
];

const DESCRIPTION =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

/**
 * Vide toutes les tables. L'ordre suit les dépendances de clés étrangères :
 * les cascades ne couvrent pas les relations en Restrict (orders → users,
 * order_items → products, blog_posts → blog_authors).
 */
async function truncate() {
	await prisma.$transaction([
		prisma.blogPostTag.deleteMany(), // BLOG-PLUGIN
		prisma.blogComment.deleteMany(), // BLOG-PLUGIN
		prisma.blogPost.deleteMany(), // BLOG-PLUGIN
		prisma.blogCategory.deleteMany(), // BLOG-PLUGIN
		prisma.blogAuthor.deleteMany(), // BLOG-PLUGIN
		prisma.blogTag.deleteMany(), // BLOG-PLUGIN
		prisma.custom.deleteMany(),
		prisma.orderStatusHistory.deleteMany(),
		prisma.orderItem.deleteMany(),
		prisma.transaction.deleteMany(), // COMMERCE-PLUGIN
		prisma.order.deleteMany(), // COMMERCE-PLUGIN
		prisma.address.deleteMany(),
		prisma.productCategory.deleteMany(),
		prisma.product.deleteMany(),
		prisma.category.deleteMany(),
		prisma.promoCode.deleteMany(),
		prisma.contactSubmission.deleteMany(),
		prisma.session.deleteMany(),
		prisma.emailVerificationRequest.deleteMany(),
		prisma.passwordResetSession.deleteMany(),
		prisma.user.deleteMany()
	]);
}

async function main() {
	console.log('Nettoyage de la base…');
	await truncate();

	const recoveryCode = generateRecoveryCode();

	const adminUser = await prisma.user.create({
		data: {
			email: ADMIN_EMAIL,
			username: 'Admin',
			passwordHash: ADMIN_PASSWORD_HASH,
			emailVerified: true,
			role: 'ADMIN',
			name: 'Admin User',
			totpKey: Buffer.from(encrypt(randomBytes(32))),
			recoveryCode: encrypt(Buffer.from(recoveryCode, 'utf-8')).toString('base64'),
			googleId: null,
			isMfaEnabled: false
		}
	});
	console.log(`Administrateur créé : ${adminUser.email} (recovery code : ${recoveryCode})`);

	const categories = new Map();
	for (const name of CATEGORIES) {
		const category = await prisma.category.create({ data: { name } });
		categories.set(name, category.id);
	}
	console.log(`${categories.size} catégories produit créées.`);

	// PRODUCT-PLUGIN ▼
	for (const product of PRODUCTS) {
		await prisma.product.create({
			data: {
				name: product.name,
				description: DESCRIPTION,
				price: 0.9166666666666667,
				stock: 100000,
				images: [product.image],
				slug: product.slug,
				colorProduct: product.colorProduct,
				categories: {
					create: { categoryId: categories.get(product.category) }
				}
			}
		});
	}
	console.log(`${PRODUCTS.length} produits créés.`);
	// PRODUCT-PLUGIN ▲

	// BLOG-PLUGIN ▼
	const author = await prisma.blogAuthor.create({
		data: { name: adminUser.name ?? 'Admin User' }
	});

	const blogCategory = await prisma.blogCategory.create({
		data: {
			name: 'XPLICITDRINK',
			description: 'Articles sur XPLICITDRINK et les boissons énergisantes.'
		}
	});

	for (const article of blog) {
		await prisma.blogPost.create({
			data: {
				title: article.title,
				content: article.content,
				slug: article.link,
				published: true,
				authorId: author.id,
				categoryId: blogCategory.id
			}
		});
	}
	console.log(`${blog.length} articles de blog créés.`);
	// BLOG-PLUGIN ▲

	await prisma.promoCode.createMany({
		data: [
			{ code: 'WELCOME10', type: 'PERCENTAGE', value: 10, minAmount: 20, active: true },
			{ code: 'FIXED5', type: 'FIXED', value: 5, minAmount: 30, usageLimit: 100, active: true }
		]
	});
	console.log('2 codes promo créés.');
}

main()
	.then(() => console.log('Seed terminé.'))
	.catch((error) => {
		console.error('Échec du seed :', error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
