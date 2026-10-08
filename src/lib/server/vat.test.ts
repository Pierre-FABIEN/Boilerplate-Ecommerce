import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getVatRate`/`updateVatRate` — remplace l'ancienne constante `TVA_RATE`
 * figée à 5,5 % (voir RESTE_A_FAIRE.md). Sans Redis configuré dans
 * cet environnement de test (même constat que les autres tests de cette
 * session), `cached()`/`bumpCacheVersion()` se replient proprement sans
 * mock nécessaire — seul Prisma est mocké ici.
 */

const storeSettingsFindUnique = vi.fn();
const storeSettingsUpdate = vi.fn();

vi.mock('$lib/server', () => ({
	prisma: {
		storeSettings: {
			findUnique: storeSettingsFindUnique,
			update: storeSettingsUpdate
		}
	}
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe('getVatRate', () => {
	it('renvoie le taux stocké en base', async () => {
		storeSettingsFindUnique.mockResolvedValue({ vatRate: 0.2 });
		const { getVatRate } = await import('./vat');

		expect(await getVatRate()).toBe(0.2);
	});

	it('replie sur 0.055 si la ligne StoreSettings est absente', async () => {
		storeSettingsFindUnique.mockResolvedValue(null);
		const { getVatRate } = await import('./vat');

		expect(await getVatRate()).toBe(0.055);
	});
});

describe('updateVatRate', () => {
	it('écrit le nouveau taux et le renvoie', async () => {
		storeSettingsUpdate.mockResolvedValue({ vatRate: 0.2 });
		const { updateVatRate } = await import('./vat');

		const result = await updateVatRate(0.2);

		expect(result).toBe(0.2);
		expect(storeSettingsUpdate).toHaveBeenCalledWith({
			where: { id: 'singleton' },
			data: { vatRate: 0.2 }
		});
	});
});
