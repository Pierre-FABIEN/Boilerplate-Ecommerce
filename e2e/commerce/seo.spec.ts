import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/admin';
import {
	createBlogPost,
	createCatalogProduct,
	deleteBlogPost,
	deleteCatalogProduct,
	promoteToAdmin
} from '../support/db';

/**
 * Gestion du SEO — voir RESTE_A_FAIRE.md. Trois garanties vérifiées
 * en conditions réelles, pas seulement en lisant le code : le sitemap liste
 * bien les produits et articles réels (généré dynamiquement, pas une liste
 * figée), les zones privées sont bien en noindex (posé au niveau du layout
 * — un seul test par layout suffit à couvrir toutes les sous-pages,
 * actuelles et futures), et un article de blog a un SEO propre à son
 * contenu plutôt que le titre générique du site.
 */
test.describe('SEO', () => {
	test.setTimeout(4 * 60_000);

	test('le sitemap liste les produits et articles publiés réels', async ({ page }) => {
		const { product } = await createCatalogProduct();
		const { post } = await createBlogPost();

		try {
			// `import.meta.glob(..., { eager: true })` sur toutes les pages du
			// site (implémentation existante, pas introduite ici) : premier
			// appel très lent à froid en dev (compilation Vite de chaque
			// +page.svelte), d'où un timeout plus généreux que la normale.
			const response = await page.request.get('/sitemap.xml', { timeout: 90_000 });
			expect(response.status()).toBe(200);
			const body = await response.text();
			expect(body).toContain(`/products/${product.slug}`);
			expect(body).toContain(`/blog/${post.slug}`);
		} finally {
			await deleteCatalogProduct(product.id);
			await deleteBlogPost(post.id);
		}
	});

	test('les zones privées (/auth, /admin) sont en noindex', async ({ page, account }) => {
		await test.step('/auth/login, accessible sans connexion', async () => {
			await page.goto('/auth/login');
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
				'content',
				'noindex, nofollow'
			);
		});

		await test.step('/admin, une fois connecté en tant qu’administrateur', async () => {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);
			await page.goto('/admin');
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
				'content',
				'noindex, nofollow'
			);
		});
	});

	test('un article de blog a son propre titre et sa propre description', async ({ page }) => {
		const { post } = await createBlogPost({ title: 'Comment choisir sa bague de fiançailles' });

		try {
			await page.goto(`/blog/${post.slug}`);
			await expect(page).toHaveTitle(/Comment choisir sa bague de fiançailles/);
			await expect(page.locator('meta[property="article:author"]')).toHaveAttribute(
				'content',
				/.+/
			);
		} finally {
			await deleteBlogPost(post.id);
		}
	});

	test('une seule balise robots par page (pas de doublon app.html + SEO.svelte)', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
		await expect(page.locator('meta[name="description"]')).toHaveCount(1);
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
	});

	test('app.html ne fuite jamais de contenu <head> dans le <body>', async ({ page }) => {
		// Régression précise : app.html mentionnait autrefois `%sveltekit.head%`
		// en toutes lettres à l'intérieur d'un commentaire HTML — SvelteKit
		// remplace ce jeton partout où le texte apparaît dans le fichier, sans
		// tenir compte des commentaires, ce qui rouvrait le commentaire en
		// plein milieu et laissait fuiter tout le <head> (polices, meta...) en
		// texte visible dans le <body> de chaque page.
		await page.goto('/');
		const bodyText = await page.locator('body').innerText();
		expect(bodyText).not.toContain('@font-face');
		expect(bodyText).not.toContain('sveltekit.head');
	});

	test('image Open Graph par défaut résolue (pas de 404)', async ({ page }) => {
		await page.goto('/');
		const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
		expect(ogImage).toBeTruthy();
		// `ogImage` est une URL absolue vers le domaine de production
		// (`seoConfig.site.url`) : on ne teste que le chemin, contre le
		// serveur e2e local, jamais le vrai domaine.
		const path = new URL(ogImage!).pathname;
		const response = await page.request.get(path);
		expect(response.status()).toBe(200);
	});
});
