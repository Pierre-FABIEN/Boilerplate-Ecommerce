import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import { blogAdminRow } from '../support/blog';
import {
	createBlogAuthor,
	createBlogCategoryValue,
	createBlogPost,
	db,
	deleteBlogPost,
	getBlogPostById,
	promoteToAdmin,
	setBlogPostPublished,
	updateBlogPostTitle
} from '../support/db';

/**
 * CRUD admin du blog : liste, édition, suppression, brouillon, CLIENT.
 *
 * L'édition/suppression passe par Prisma direct dans la plupart des tests
 * (l'éditeur TinyMCE n'est pas joué en e2e), sauf la création (`?/createPost`,
 * voir ci-dessous) : postée directement en `page.request.post`, sans piloter
 * TinyMCE, mais en exerçant la vraie logique serveur (slug unique, parsing
 * `taxonomyValueIds`, conversion `published`).
 */
test.describe('Administration — blog', () => {
	test.setTimeout(6 * 60_000);

	test('liste, édition, suppression et dépublication', async ({ page, account }) => {
		const editable = await createBlogPost({ published: true });
		const removable = await createBlogPost({ published: true });
		const toUnpublish = await createBlogPost({ published: true });

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. La liste admin affiche les articles', async () => {
				await page.goto('/admin/blog');
				await waitForPath(page, '/admin/blog');
				await expect(page.getByRole('heading', { name: 'Gestion du blog' })).toBeVisible();
				const search = page.getByPlaceholder('Cherchez dans le tableau').first();
				await search.fill(editable.post.title);
				await expect(blogAdminRow(page, editable.post.title)).toBeVisible();
			});

			await test.step('2. Création Prisma visible sur la vitrine', async () => {
				await page.goto('/blog');
				await expect(page.getByRole('heading', { name: editable.post.title })).toBeVisible();
				expect(await getBlogPostById(editable.post.id)).not.toBeNull();
			});

			await test.step('3. Édition du titre', async () => {
				const nextTitle = `${editable.post.title}-édité`;
				await updateBlogPostTitle(editable.post.id, nextTitle);

				const updated = await getBlogPostById(editable.post.id);
				expect(updated?.title).toBe(nextTitle);

				await page.goto(`/blog/${editable.post.slug}`);
				await expect(page.getByRole('heading', { name: nextTitle })).toBeVisible();
			});

			await test.step('4. Suppression d’un article', async () => {
				await page.goto('/admin/blog');
				await page.getByPlaceholder('Cherchez dans le tableau').first().fill(removable.post.title);
				const row = blogAdminRow(page, removable.post.title);
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deleteBlogPost') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
				]);
				expect(await getBlogPostById(removable.post.id)).toBeNull();
			});

			await test.step('5. Dépublier retire l’article de la vitrine', async () => {
				await setBlogPostPublished(toUnpublish.post.id, false);
				const response = await page.goto(`/blog/${toUnpublish.post.slug}`);
				expect(response?.status()).toBe(404);
			});
		} finally {
			await deleteBlogPost(editable.post.id);
			await deleteBlogPost(removable.post.id);
			await deleteBlogPost(toUnpublish.post.id);
		}
	});

	test('un CLIENT ne peut pas supprimer un article', async ({ page, account }) => {
		const created = await createBlogPost();

		try {
			await signUpAndVerify(page, account);
			const origin = pageOrigin(page);
			await page.request.post('/admin/blog?/deleteBlogPost', {
				form: { id: created.post.id },
				headers: { Origin: origin }
			});
			expect(await getBlogPostById(created.post.id)).not.toBeNull();
		} finally {
			await deleteBlogPost(created.post.id);
		}
	});

	test('création (?/createPost) : slug unique, taxonomies et statut publié', async ({
		page,
		account
	}) => {
		const author = await createBlogAuthor();
		const category = await createBlogCategoryValue();
		const stamp = Date.now();
		const title = `e2e-createPost-${stamp}`;
		let firstId: string | undefined;
		let secondId: string | undefined;

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);
			const origin = pageOrigin(page);

			await test.step('1. Création : slug dérivé du titre, publié, taxonomie liée', async () => {
				const response = await page.request.post('/admin/blog/post/create?/createPost', {
					form: {
						title,
						content: '<p>Contenu créé directement via ?/createPost (sans TinyMCE).</p>',
						authorId: author.id,
						published: 'on',
						taxonomyValueIds: category.id
					},
					headers: { Origin: origin }
				});
				expect(response.ok()).toBe(true);

				const created = await db.blogPost.findFirst({ where: { title } });
				expect(created).not.toBeNull();
				firstId = created!.id;
				expect(created!.slug).toBe(created!.slug.toLowerCase());
				expect(created!.published).toBe(true);

				const link = await db.blogPostTaxonomyValue.findFirst({
					where: { postId: created!.id, taxonomyValueId: category.id }
				});
				expect(link).not.toBeNull();
			});

			await test.step('2. Même titre : slug désambiguïsé (suffixe numérique), brouillon par défaut', async () => {
				const response = await page.request.post('/admin/blog/post/create?/createPost', {
					form: {
						title,
						content: '<p>Second article, même titre, doit obtenir un slug différent.</p>',
						authorId: author.id
						// `published` omis : le checkbox non coché n'envoie rien en HTML natif.
					},
					headers: { Origin: origin }
				});
				expect(response.ok()).toBe(true);

				const posts = await db.blogPost.findMany({
					where: { title },
					orderBy: { createdAt: 'asc' }
				});
				expect(posts).toHaveLength(2);
				secondId = posts[1].id;
				expect(posts[1].slug).not.toBe(posts[0].slug);
				expect(posts[1].published).toBe(false);
			});
		} finally {
			if (firstId) await deleteBlogPost(firstId);
			if (secondId) await deleteBlogPost(secondId);
		}
	});
});
