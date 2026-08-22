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

	// eslint-disable-next-line no-empty-pattern
	account: async ({}, use) => {
		const account = makeAccount();
		await use(account);
		await deleteUser(account.email);
	}
});

export { expect } from '@playwright/test';
