import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import {
	createBlogPost,
	deleteBlogPost,
	getBlogPostBySlug
} from '../support/db';

/**
 * Vitrine publique Prisma : liste, fiche, 404, brouillon. Pas de formulaires admin.
 */
test.describe('Blog — vitrine', () => {
	test('liste, fiche, slug inconnu et brouillon', async ({ page }) => {
		const published = await createBlogPost({ published: true });
		const draft = await createBlogPost({ published: false });

		try {
			await test.step('1. La liste affiche le titre Prisma', async () => {
				await page.goto('/blog');
				await waitForPath(page, '/blog');
				await expect(page.getByRole('heading', { name: 'Blog' })).toBeVisible();
				await expect(page.getByRole('heading', { name: published.post.title })).toBeVisible();
				await expect(
					page
						.getByRole('navigation', { name: 'Filtrer par catégorie' })
						.getByRole('link', { name: published.category.name, exact: true })
				).toBeVisible();
			});

			await test.step('2. La fiche s’ouvre par slug', async () => {
				await page.goto(`/blog/${published.post.slug}`);
				await waitForPath(page, `/blog/${published.post.slug}`);
				await expect(page.getByRole('heading', { name: published.post.title })).toBeVisible();
				await expect(page.getByText(published.author.name)).toBeVisible();
				expect(await getBlogPostBySlug(published.post.slug)).not.toBeNull();
			});

			await test.step('3. Un slug inconnu renvoie 404', async () => {
				const response = await page.goto('/blog/e2e-slug-inconnu-absent');
				expect(response?.status()).toBe(404);
			});

			await test.step('4. Un brouillon n’est pas public', async () => {
				const response = await page.goto(`/blog/${draft.post.slug}`);
				expect(response?.status()).toBe(404);
				await page.goto('/blog');
				await expect(page.getByRole('heading', { name: draft.post.title })).toHaveCount(0);
			});

			await test.step('5. Pas d’UI d’édition admin sur la vitrine', async () => {
				await page.goto('/blog');
				const html = await page.content();
				expect(html).not.toContain('/admin/blog');
				expect(html).not.toContain('passwordHash');
			});
		} finally {
			await deleteBlogPost(published.post.id);
			await deleteBlogPost(draft.post.id);
		}
	});
});
