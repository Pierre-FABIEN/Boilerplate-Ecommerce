import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * §3.2 de l'audit fonctionnel : `resolveAppUrl() ?? ''` produisait un lien
 * relatif (donc cassé dans un client e-mail) quand ni `APP_URL` ni
 * `VERCEL_URL` n'étaient définis. `resolveAppUrlOrDefault` centralise le
 * repli absolu déjà utilisé par `invoice/email.ts`, pour les 5 jobs qui
 * envoient des liens par e-mail.
 */

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('resolveAppUrlOrDefault', () => {
	it('retombe sur http://localhost:2000 si APP_URL et VERCEL_URL sont absents', async () => {
		vi.stubEnv('APP_URL', '');
		vi.stubEnv('VERCEL_URL', '');
		const { resolveAppUrlOrDefault } = await import('./app-url');

		expect(resolveAppUrlOrDefault()).toBe('http://localhost:2000');
	});

	it('utilise APP_URL quand elle est définie', async () => {
		vi.stubEnv('APP_URL', 'https://boutique.example.test/');
		const { resolveAppUrlOrDefault } = await import('./app-url');

		expect(resolveAppUrlOrDefault()).toBe('https://boutique.example.test');
	});
});
