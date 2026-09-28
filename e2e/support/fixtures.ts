import { test as base } from '@playwright/test';
import { makeAccount, makeClientIp, type Account } from './account';
import { deleteUser } from './db';

type Fixtures = {
	/** Identité fraîche, supprimée de la base à la fin du test. */
	account: Account;
};

export const test = base.extend<Fixtures>({
	// Chaque contexte navigateur annonce une IP différente, ce qui isole les
	// limiteurs de débit indexés sur l'adresse du client.
	contextOptions: async ({ contextOptions }, use) => {
		await use({
			...contextOptions,
			extraHTTPHeaders: {
				...contextOptions.extraHTTPHeaders,
				'X-Forwarded-For': makeClientIp()
			}
		});
	},

	/**
	 * Joint au rapport, en cas d'échec seulement, ce que la page a réellement
	 * vécu : exception JavaScript, erreur console, réponse HTTP en erreur.
	 *
	 * Sans ça, un échec se lit « élément introuvable » — symptôme identique
	 * qu'il s'agisse d'une erreur serveur, d'un plantage à l'hydratation ou
	 * d'une redirection inattendue, ce qui rend le diagnostic impossible sans
	 * réinstrumenter à la main.
	 */
	page: async ({ page }, use, testInfo) => {
		const observed: string[] = [];

		page.on('pageerror', (error) => observed.push(`[pageerror] ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error') observed.push(`[console] ${message.text()}`);
		});
		page.on('response', (response) => {
			if (response.status() >= 400) {
				observed.push(
					`[http ${response.status()}] ${response.request().method()} ${response.url()}`
				);
			}
		});

		await use(page);

		if (testInfo.status !== testInfo.expectedStatus && observed.length > 0) {
			await testInfo.attach('journal navigateur', {
				body: observed.join('\n'),
				contentType: 'text/plain'
			});
		}
	},

	// eslint-disable-next-line no-empty-pattern
	account: async ({}, use) => {
		const account = makeAccount();
		await use(account);
		await deleteUser(account.email);
	}
});

export { expect } from '@playwright/test';
