import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `recordLoginEvent` est le seul endroit qui décide si un appareil est
 * « nouveau » (déclenche `notifyNewDeviceLogin`, voir les 4 points d'appel
 * dans `src/routes/auth/`) — cette décision doit être exacte : ni fausse
 * alerte sur un appareil déjà connu, ni silence sur un vrai nouvel appareil.
 */

const loginEventFindMany = vi.fn();
const loginEventCreate = vi.fn().mockResolvedValue({});

vi.mock('$lib/server', () => ({
	prisma: {
		loginEvent: {
			findMany: (...args: unknown[]) => loginEventFindMany(...args),
			create: (...args: unknown[]) => loginEventCreate(...args)
		}
	}
}));

import { recordLoginEvent } from './loginEvent';

const device = {
	userAgent:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.138 Safari/537.36',
	ipAddress: '203.0.113.1',
	city: 'Lyon',
	country: 'FR'
};

beforeEach(() => {
	vi.clearAllMocks();
	loginEventCreate.mockResolvedValue({});
	loginEventFindMany.mockResolvedValue([]);
});

describe('recordLoginEvent', () => {
	it('aucun événement antérieur → isNewDevice: true', async () => {
		loginEventFindMany.mockResolvedValue([]);

		const result = await recordLoginEvent('user_1', 'password', device);

		expect(result.isNewDevice).toBe(true);
		expect(loginEventFindMany).toHaveBeenCalledWith({
			where: { userId: 'user_1', userAgent: { not: null } },
			select: { userAgent: true },
			distinct: ['userAgent'],
			orderBy: { createdAt: 'desc' },
			take: 50
		});
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ userId: 'user_1', method: 'password', isNewDevice: true })
		});
	});

	it('même User-Agent exact déjà vu → isNewDevice: false', async () => {
		loginEventFindMany.mockResolvedValue([{ userAgent: device.userAgent }]);

		const result = await recordLoginEvent('user_1', 'google', device);

		expect(result.isNewDevice).toBe(false);
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ isNewDevice: false })
		});
	});

	it('bump de version mineure/build Chrome (même version majeure) → pas de nouvelle alerte', async () => {
		loginEventFindMany.mockResolvedValue([
			{
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.50 Safari/537.36'
			}
		]);

		const result = await recordLoginEvent('user_1', 'password', device);

		expect(result.isNewDevice).toBe(false);
	});

	it('changement de version majeure Chrome → nouvelle alerte', async () => {
		loginEventFindMany.mockResolvedValue([
			{
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.100 Safari/537.36'
			}
		]);

		const result = await recordLoginEvent('user_1', 'password', device);

		expect(result.isNewDevice).toBe(true);
	});

	it("changement d'OS (même navigateur, même version majeure) → nouvelle alerte", async () => {
		loginEventFindMany.mockResolvedValue([
			{
				userAgent:
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.50 Safari/537.36'
			}
		]);

		const result = await recordLoginEvent('user_1', 'password', device);

		expect(result.isNewDevice).toBe(true);
	});

	it('changement de navigateur (même OS, même famille de version) → nouvelle alerte', async () => {
		loginEventFindMany.mockResolvedValue([
			{
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
			}
		]);

		const result = await recordLoginEvent('user_1', 'password', device);

		expect(result.isNewDevice).toBe(true);
	});

	it('User-Agent absent → jamais "nouveau" (rien à comparer), mais l’événement est quand même enregistré', async () => {
		const result = await recordLoginEvent('user_1', 'password-reset', {
			...device,
			userAgent: null
		});

		expect(result.isNewDevice).toBe(false);
		// Pas de comparaison possible sans User-Agent : `findMany` n'a pas lieu d'être appelé.
		expect(loginEventFindMany).not.toHaveBeenCalled();
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ userAgent: null, isNewDevice: false })
		});
	});

	it('User-Agent non reconnu (navigateur inconnu) → jamais "nouveau", rien à comparer', async () => {
		const result = await recordLoginEvent('user_1', 'password', {
			...device,
			userAgent: 'SomeUnknownBot/1.0'
		});

		expect(result.isNewDevice).toBe(false);
		expect(loginEventFindMany).not.toHaveBeenCalled();
	});

	it('method "signup" : jamais "nouveau", même appareil jamais vu — aucune alerte à la création du compte', async () => {
		const result = await recordLoginEvent('user_1', 'signup', device);

		expect(result.isNewDevice).toBe(false);
		expect(loginEventFindMany).not.toHaveBeenCalled();
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ method: 'signup', isNewDevice: false })
		});
	});

	it('la comparaison est bornée au compte : deux comptes différents avec le même appareil ne se contaminent pas', async () => {
		loginEventFindMany.mockResolvedValue([]);

		await recordLoginEvent('user_2', 'password', device);

		expect(loginEventFindMany).toHaveBeenCalledWith({
			where: { userId: 'user_2', userAgent: { not: null } },
			select: { userAgent: true },
			distinct: ['userAgent'],
			orderBy: { createdAt: 'desc' },
			take: 50
		});
	});
});
