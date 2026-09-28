import type { APIResponse } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { pageOrigin, signUpAndVerify, sveltekitActionHeaders } from '../support/admin';
import {
	clearUserPassword,
	createCatalogProduct,
	createUserAddress,
	deleteCatalogProduct,
	deleteUser,
	getUser,
	linkProductToOrder,
	requireUser,
	simulatePaidOrder
} from '../support/db';

/**
 * RGPD self-service (`/auth/settings/donnees`) : export (portabilité, art.
 * 20) et suppression par anonymisation (effacement, art. 17) — voir
 * `$lib/prisma/user/anonymizeUser.ts`. La ligne `User` n'est jamais
 * supprimée physiquement, seuls ses champs identifiants sont scrubés :
 * `Order`/`Transaction` doivent rester intacts après suppression
 * (obligation comptable), c'est le point le plus important à vérifier ici.
 *
 * `page.request.post` n'est pas une navigation de page : SvelteKit sérialise
 * tout `ActionResult` (`fail()` comme `redirect()`) en 200 + JSON
 * (`{type, status, ...}`) plutôt qu'un vrai code HTTP, pour une requête
 * qui a l'air d'un `fetch` (confirmé en conditions réelles ailleurs dans
 * cette suite, `fraud-detection.spec.ts`, pour `redirect()` — même
 * mécanisme pour `fail()`, jamais un vrai 400 direct ici).
 */
async function expectFailure(response: APIResponse, status: number) {
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.type).toBe('failure');
	expect(body.status).toBe(status);
	return body.data;
}

async function expectRedirect(response: APIResponse) {
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.type).toBe('redirect');
}
test.describe('RGPD — mes données', () => {
	test.setTimeout(6 * 60_000);

	test('export contient mes données ; suppression exige le bon mot de passe et anonymise', async ({
		page,
		account
	}) => {
		const created = await createCatalogProduct();
		const { product } = created;
		let anonymizedEmail: string | undefined;

		try {
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			anonymizedEmail = `deleted-${user.id}@erased.local`;
			const address = await createUserAddress(user.id);
			const linked = await linkProductToOrder(user.id, product.id);
			await simulatePaidOrder(linked.order.id, user.id, account.email);
			const origin = pageOrigin(page);

			await test.step('1. Export : contient mon adresse et ma commande', async () => {
				const response = await page.request.get('/auth/settings/donnees/export');
				expect(response.status()).toBe(200);
				expect(response.headers()['content-disposition']).toContain('attachment');

				const body = await response.json();
				expect(body.profil.email).toBe(account.email);
				expect(body.adresses.some((a: { id: string }) => a.id === address.id)).toBe(true);
				expect(body.commandes.some((o: { id: string }) => o.id === linked.order.id)).toBe(true);
				// Historique des connexions (LoginEvent) inclus dans l'export — au moins
				// l'inscription elle-même, déjà survenue via `signUpAndVerify` ci-dessus.
				expect(
					body.historique_connexions.some((e: { methode: string }) => e.methode === 'signup')
				).toBe(true);
			});

			await test.step('2. Mauvais mot de passe : suppression refusée', async () => {
				const response = await page.request.post('/auth/settings/donnees?/delete', {
					form: { password: 'MotDePasseIncorrect123!' },
					headers: sveltekitActionHeaders(origin)
				});
				await expectFailure(response, 400);

				const stillThere = await getUser(account.email);
				expect(stillThere?.email).toBe(account.email);
			});

			await test.step('3. Bon mot de passe : compte anonymisé, commande conservée', async () => {
				const response = await page.request.post('/auth/settings/donnees?/delete', {
					form: { password: account.password },
					headers: sveltekitActionHeaders(origin),
					maxRedirects: 0
				});
				await expectRedirect(response);

				const anonymized = await getUser(account.email);
				expect(anonymized).toBeNull(); // e-mail changé : plus trouvable par l'ancien

				// La commande/transaction existent toujours — l'historique
				// comptable n'est jamais perdu (voir CONFORMITE_ECOMMERCE.md).
				const kept = await requireUser(anonymizedEmail!);
				expect(kept.id).toBe(user.id);
				expect(kept.passwordHash).toBeNull();
				expect(kept.username).toBeNull();
			});
		} finally {
			await deleteCatalogProduct(product.id);
			// Nettoie le compte anonymisé (Transaction/Order inclus) — le fixture
			// `account` ne connaît que l'e-mail d'origine, plus valide après
			// anonymisation (voir étape 3, l'e-mail a changé).
			if (anonymizedEmail) await deleteUser(anonymizedEmail);
		}
	});

	test('compte sans mot de passe : exige le texte de confirmation exact', async ({
		page,
		account
	}) => {
		let anonymizedEmail: string | undefined;
		try {
			await signUpAndVerify(page, account);
			await clearUserPassword(account.email);
			const user = await requireUser(account.email);
			anonymizedEmail = `deleted-${user.id}@erased.local`;
			const origin = pageOrigin(page);

			await test.step('Mauvaise saisie : refusée', async () => {
				const response = await page.request.post('/auth/settings/donnees?/delete', {
					form: { confirmText: 'supprimer' }, // casse différente, doit échouer
					headers: sveltekitActionHeaders(origin)
				});
				await expectFailure(response, 400);
			});

			await test.step('Saisie exacte : acceptée', async () => {
				const response = await page.request.post('/auth/settings/donnees?/delete', {
					form: { confirmText: 'SUPPRIMER' },
					headers: sveltekitActionHeaders(origin),
					maxRedirects: 0
				});
				await expectRedirect(response);

				const anonymized = await getUser(account.email);
				expect(anonymized).toBeNull();
			});
		} finally {
			if (anonymizedEmail) await deleteUser(anonymizedEmail);
		}
	});
});
