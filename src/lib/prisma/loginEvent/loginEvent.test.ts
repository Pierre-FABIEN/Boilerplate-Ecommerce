import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `recordLoginEvent` est le seul endroit qui décide si un appareil est
 * « nouveau » (déclenche `notifyNewDeviceLogin`, voir les 4 points d'appel
 * dans `src/routes/auth/`) — cette décision doit être exacte : ni fausse
 * alerte sur un appareil déjà connu, ni silence sur un vrai nouvel appareil.
 */

const loginEventFindFirst = vi.fn();
const loginEventCreate = vi.fn().mockResolvedValue({});

vi.mock('$lib/server', () => ({
	prisma: {
		loginEvent: {
			findFirst: (...args: unknown[]) => loginEventFindFirst(...args),
			create: (...args: unknown[]) => loginEventCreate(...args)
		}
	}
}));

import { recordLoginEvent } from './loginEvent';

const device = {
	userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0',
	ipAddress: '203.0.113.1',
	city: 'Lyon',
	country: 'FR'
};

beforeEach(() => {
	vi.clearAllMocks();
	loginEventCreate.mockResolvedValue({});
});

describe('recordLoginEvent', () => {
	it('aucun événement antérieur avec ce User-Agent → isNewDevice: true', async () => {
		loginEventFindFirst.mockResolvedValue(null);

		const result = await recordLoginEvent('user_1', 'password', device);

		expect(result.isNewDevice).toBe(true);
		expect(loginEventFindFirst).toHaveBeenCalledWith({
			where: { userId: 'user_1', userAgent: device.userAgent },
			select: { id: true }
		});
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ userId: 'user_1', method: 'password', isNewDevice: true })
		});
	});

	it('un événement antérieur avec le même User-Agent → isNewDevice: false', async () => {
		loginEventFindFirst.mockResolvedValue({ id: 'evt_prev' });

		const result = await recordLoginEvent('user_1', 'google', device);

		expect(result.isNewDevice).toBe(false);
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ isNewDevice: false })
		});
	});

	it('User-Agent absent → jamais "nouveau" (rien à comparer), mais l’événement est quand même enregistré', async () => {
		const result = await recordLoginEvent('user_1', 'password-reset', {
			...device,
			userAgent: null
		});

		expect(result.isNewDevice).toBe(false);
		// Pas de comparaison possible sans User-Agent : `findFirst` n'a pas lieu d'être appelé.
		expect(loginEventFindFirst).not.toHaveBeenCalled();
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ userAgent: null, isNewDevice: false })
		});
	});

	it('method "signup" : jamais "nouveau", même appareil jamais vu — aucune alerte à la création du compte', async () => {
		const result = await recordLoginEvent('user_1', 'signup', device);

		expect(result.isNewDevice).toBe(false);
		expect(loginEventFindFirst).not.toHaveBeenCalled();
		expect(loginEventCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ method: 'signup', isNewDevice: false })
		});
	});

	it('la comparaison est bornée au compte : deux comptes différents avec le même appareil ne se contaminent pas', async () => {
		loginEventFindFirst.mockResolvedValue(null);

		await recordLoginEvent('user_2', 'password', device);

		expect(loginEventFindFirst).toHaveBeenCalledWith({
			where: { userId: 'user_2', userAgent: device.userAgent },
			select: { id: true }
		});
	});
});
