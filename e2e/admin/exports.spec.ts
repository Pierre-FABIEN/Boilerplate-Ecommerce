import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	createOldCatalogProduct,
	deleteCatalogProduct,
	deleteUser,
	getProductById,
	linkProductToOrder,
	occupyEmail,
	promoteToAdmin,
	requireUser
} from '../support/db';

/**
 * Données — export CSV, purge ciblée par ancienneté, réimport (`/admin/exports`).
 *
 * La purge est testée sur `products` avec un seuil de 365 jours (le préréglage
 * de l'UI) et des lignes volontairement vieillies de plusieurs années : ainsi
 * seules ces lignes de test sont concernées, jamais une fiche créée par un
 * autre spec (toujours `createdAt` récent).
 */
test.describe('Administration — exports, purge, import', () => {
	test.setTimeout(6 * 60_000);

	test('export, purge et réimport du jeu de données produits', async ({ page, account }) => {
		const recent = await createCatalogProduct();
		// Objet plutôt que deux `let` : muter une propriété (plutôt que
		// réaffecter la variable) évite un faux positif de TypeScript 6 — son
		// analyse de flux de contrôle, à travers les closures passées à
		// `test.step(...)`, réduit le type d'un `let` réaffecté dans une
		// closure à `null` au point du `finally` (une variable normale n'a pas
		// ce problème).
		const created: {
			old: Awaited<ReturnType<typeof createOldCatalogProduct>> | null;
			lockedOld: Awaited<ReturnType<typeof createOldCatalogProduct>> | null;
		} = { old: null, lockedOld: null };
		const ownerEmail = `e2e-exports-owner-${Date.now()}@example.test`;

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			const productsBlock = page.locator('.rounded-lg.border').filter({ hasText: 'Produits' });

			await test.step('1. Export CSV téléchargeable, colonnes attendues', async () => {
				await page.goto('/admin/exports');
				await waitForPath(page, '/admin/exports');
				await expect(
					page.getByRole('heading', { name: 'Données — export, purge, import' })
				).toBeVisible();
				await expect(productsBlock.getByRole('link', { name: 'Exporter' })).toHaveAttribute(
					'href',
					'/admin/exports/products'
				);

				const response = await page.request.get('/admin/exports/products');
				expect(response.status()).toBe(200);
				expect(response.headers()['content-type']).toContain('text/csv');
				const csv = await response.text();
				expect(csv).toContain('ID,Nom,Slug,Prix,Stock,Catégories,Description,Créé le');
				expect(csv).toContain(recent.product.name);
			});

			const baseline = await (
				await page.request.get('/admin/exports/products/purge?days=365')
			).json();

			await test.step('2. Aperçu de purge : compte les lignes de plus de 365 jours', async () => {
				created.old = await createOldCatalogProduct(400);
				await occupyEmail(ownerEmail);
				const owner = await requireUser(ownerEmail);
				created.lockedOld = await createOldCatalogProduct(400);
				await linkProductToOrder(owner.id, created.lockedOld.product.id);

				await page.reload();
				await productsBlock.locator('input[type="number"]').fill('365');
				await productsBlock.getByRole('button', { name: 'Prévisualiser' }).click();
				await expect(productsBlock.getByText(/ligne\(s\) concernée\(s\)/)).toBeVisible();
				await expect(
					productsBlock.getByText(`${baseline.count + 2} ligne(s) concernée(s)`)
				).toBeVisible();
			});

			await test.step('3. Purge : supprime la ligne libre, ignore la ligne liée à une commande', async () => {
				await productsBlock.getByRole('button', { name: 'Confirmer la suppression' }).click();
				await expect(
					productsBlock.getByText('1 ligne(s) supprimée(s), 1 ignorée(s) (liées à des commandes)')
				).toBeVisible();

				expect(await getProductById(created.old!.product.id)).toBeNull();
				expect(await getProductById(created.lockedOld!.product.id)).not.toBeNull();
				expect(await getProductById(recent.product.id)).not.toBeNull();
				created.old = null;
			});

			await test.step('4. Réimport : une ligne modifiée met à jour le prix', async () => {
				const csvText = await (await page.request.get('/admin/exports/products')).text();
				const lines = csvText.replace(/^\uFEFF/, '').split('\r\n');
				const header = lines[0].split(',');
				const priceIndex = header.indexOf('Prix');
				const rowIndex = lines.findIndex(
					(line, i) => i > 0 && line.startsWith(`${recent.product.id},`)
				);
				expect(rowIndex).toBeGreaterThan(0);
				const cells = lines[rowIndex].split(',');
				cells[priceIndex] = '42.42';
				// Ne garder que l'en-tête + la ligne modifiée : `lockedOld` existe
				// encore à ce stade (purge FK-protégée) et apparaîtrait aussi dans
				// l'export complet, faussant le compte de lignes mises à jour.
				const singleRowCsv = [header.join(','), cells.join(',')].join('\r\n');

				await productsBlock.locator('input[type="file"]').setInputFiles({
					name: 'products.csv',
					mimeType: 'text/csv',
					buffer: Buffer.from(singleRowCsv, 'utf-8')
				});
				await productsBlock.getByRole('button', { name: 'Importer' }).click();
				await expect(productsBlock.getByText('0 créé(s), 1 mis à jour')).toBeVisible();

				const updated = await getProductById(recent.product.id);
				expect(updated?.price).toBeCloseTo(42.42, 2);
			});
		} finally {
			await deleteCatalogProduct(recent.product.id);
			if (created.old) await deleteCatalogProduct(created.old.product.id);
			if (created.lockedOld) await deleteCatalogProduct(created.lockedOld.product.id);
			await deleteUser(ownerEmail);
		}
	});

	// Le blocage anonyme/CLIENT sur `/admin/exports`, `/admin/exports/products`
	// et `/admin/exports/products/purge` est couvert par la boucle `ADMIN_PATHS`
	// dans `e2e/admin/security.spec.ts` — pas dupliqué ici.
});
