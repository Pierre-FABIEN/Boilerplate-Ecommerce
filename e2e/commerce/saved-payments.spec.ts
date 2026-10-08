import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/admin';
import {
	createSavedPaymentMethod,
	deleteUser,
	getSavedPaymentMethodsByUserId,
	getStoreFeatureFlags,
	occupyEmail,
	requireUser,
	setStoreFeatureFlags
} from '../support/db';

/**
 * Moyens de paiement enregistrés : module activable
 * (`StoreSettings.savedPaymentsEnabled`, 404 partout si désactivé), liste,
 * ajout, carte par défaut, suppression.
 *
 * L'ajout de carte (`?/attach`) ne fait jamais `stripe.confirmCardSetup`
 * côté serveur — le `SetupIntent` existe pour que le client confirme la
 * saisie carte via Stripe Elements, mais `?/attach` se contente ensuite de
 * `stripe.paymentMethods.retrieve(paymentMethodId)` pour en lire les
 * métadonnées d'affichage. Un jeton de test Stripe réutilisable
 * (`pm_card_visa`, voir doc Stripe « Testing ») se résout en un vrai
 * `PaymentMethod` via cette même API, sans jamais passer par Stripe.js ni
 * Stripe Elements — ça permet de tester la vraie action serveur (voir
 * « ajout d'une carte » ci-dessous). La plupart des autres tests insèrent
 * malgré tout directement en base (`createSavedPaymentMethod`) pour isoler
 * les routes de lecture/suppression/défaut de l'appel Stripe.
 *
 * `StoreSettings` est une ligne unique partagée par toute la suite : les
 * valeurs d'origine sont restaurées en `finally`.
 */
test.describe('Moyens de paiement enregistrés', () => {
	test.setTimeout(6 * 60_000);

	test('module désactivé ferme la route et le point d’entrée SetupIntent', async ({
		page,
		account
	}) => {
		const originalFlags = await getStoreFeatureFlags();
		try {
			await setStoreFeatureFlags({ savedPaymentsEnabled: false });
			await signUpAndVerify(page, account);

			const response = await page.goto('/auth/settings/saved-payments');
			expect(response?.status()).toBe(404);

			const origin = new URL(page.url()).origin;
			const setupResponse = await page.request.post('/auth/settings/saved-payments/setup-intent', {
				headers: { Origin: origin }
			});
			expect(setupResponse.status()).toBe(404);
		} finally {
			await setStoreFeatureFlags(originalFlags);
		}
	});

	test('liste, carte par défaut, suppression', async ({ page, account }) => {
		const originalFlags = await getStoreFeatureFlags();

		try {
			await setStoreFeatureFlags({ savedPaymentsEnabled: true });
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);

			const first = await createSavedPaymentMethod(user.id, {
				brand: 'visa',
				last4: '4242',
				isDefault: true
			});
			const second = await createSavedPaymentMethod(user.id, {
				brand: 'mastercard',
				last4: '5555',
				isDefault: false
			});

			await test.step('1. Les deux cartes sont listées, la première par défaut', async () => {
				await page.goto('/auth/settings/saved-payments');
				await expect(page.getByText('visa •••• 4242')).toBeVisible();
				await expect(page.getByText('mastercard •••• 5555')).toBeVisible();
				await expect(page.getByText('(par défaut)')).toBeVisible();
			});

			await test.step('2. Changement de carte par défaut', async () => {
				await page
					.locator('form[action="?/setDefault"]')
					.filter({ has: page.locator(`input[value="${second.id}"]`) })
					.getByRole('button', { name: 'Définir par défaut' })
					.click();

				await expect(async () => {
					const methods = await getSavedPaymentMethodsByUserId(user.id);
					expect(methods.find((m) => m.id === second.id)?.isDefault).toBe(true);
					expect(methods.find((m) => m.id === first.id)?.isDefault).toBe(false);
				}).toPass();
			});

			await test.step('3. Suppression', async () => {
				await page
					.locator('form[action="?/delete"]')
					.filter({ has: page.locator(`input[value="${first.id}"]`) })
					.getByRole('button', { name: 'Supprimer' })
					.click();

				await expect(page.getByText('visa •••• 4242')).toHaveCount(0);
				await expect(async () => {
					const methods = await getSavedPaymentMethodsByUserId(user.id);
					expect(methods.map((m) => m.id)).not.toContain(first.id);
				}).toPass();
			});
		} finally {
			await setStoreFeatureFlags(originalFlags);
		}
	});

	test('ajout d’une carte (?/attach) via un PaymentMethod Stripe réel', async ({
		page,
		account
	}) => {
		const originalFlags = await getStoreFeatureFlags();

		try {
			await setStoreFeatureFlags({ savedPaymentsEnabled: true });
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);

			const origin = new URL(page.url()).origin;
			// `pm_card_visa` : jeton de test Stripe réutilisable, se résout en un
			// vrai `PaymentMethod` (id concret différent à chaque appel) via
			// `paymentMethods.retrieve()` — jamais besoin de Stripe Elements/d'un
			// `SetupIntent` confirmé pour exercer cette action.
			const response = await page.request.post('/auth/settings/saved-payments?/attach', {
				form: { paymentMethodId: 'pm_card_visa' },
				headers: { Origin: origin }
			});
			expect(response.ok()).toBe(true);

			const methods = await getSavedPaymentMethodsByUserId(user.id);
			expect(methods).toHaveLength(1);
			expect(methods[0]).toMatchObject({ brand: 'visa', last4: '4242', isDefault: true });

			await page.goto('/auth/settings/saved-payments');
			await expect(page.getByText('visa •••• 4242')).toBeVisible();
		} finally {
			await setStoreFeatureFlags(originalFlags);
		}
	});

	test('IDOR : un compte ne peut pas supprimer la carte d’un autre', async ({ page, account }) => {
		const originalFlags = await getStoreFeatureFlags();
		const otherEmail = `e2e-saved-payments-other-${Date.now()}@example.test`;
		await occupyEmail(otherEmail);
		const other = await requireUser(otherEmail);
		const otherCard = await createSavedPaymentMethod(other.id);

		try {
			await setStoreFeatureFlags({ savedPaymentsEnabled: true });
			await signUpAndVerify(page, account);

			const origin = new URL(page.url()).origin;
			await page.request.post('/auth/settings/saved-payments?/delete', {
				form: { id: otherCard.id },
				headers: { Origin: origin }
			});

			const methods = await getSavedPaymentMethodsByUserId(other.id);
			expect(methods.map((m) => m.id)).toContain(otherCard.id);
		} finally {
			await setStoreFeatureFlags(originalFlags);
			await deleteUser(otherEmail);
		}
	});
});
