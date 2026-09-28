import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §4.3 de l'audit fonctionnel : `updateAddress` accepte un `ownerId`
 * optionnel qui, s'il est fourni, vérifie que l'adresse appartient bien à
 * ce compte avant d'écrire — mais l'admin (`admin/users/[id]/+page.server.ts`)
 * ne le passait jamais, alors que le compte cible est parfaitement connu à
 * cet endroit (`id` du user affiché). Ce test prouve le comportement du
 * garde-fou lui-même : avec un `ownerId` qui ne correspond pas au vrai
 * propriétaire, l'écriture est bloquée (retourne `null`, `prisma.address.update`
 * jamais appelé) plutôt que d'écraser silencieusement l'adresse d'un autre
 * compte si un id d'adresse altéré/mal formé était soumis dans le formulaire.
 */

const addressFindFirst = vi.fn();
const addressUpdate = vi.fn();

vi.mock('$lib/server', () => ({
	prisma: {
		address: {
			findFirst: (...args: unknown[]) => addressFindFirst(...args),
			update: (...args: unknown[]) => addressUpdate(...args)
		}
	}
}));

describe('updateAddress — garde-fou ownerId (§4.3)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('bloque la mise à jour si l’adresse n’appartient pas à ownerId', async () => {
		addressFindFirst.mockResolvedValue(null);

		const { updateAddress } = await import('./addresses');
		const result = await updateAddress('addr_1', { userId: 'user_a' } as never, 'user_b');

		expect(result).toBeNull();
		expect(addressFindFirst).toHaveBeenCalledWith({
			where: { id: 'addr_1', userId: 'user_b' }
		});
		expect(addressUpdate).not.toHaveBeenCalled();
	});

	it('autorise la mise à jour si l’adresse appartient bien à ownerId', async () => {
		addressFindFirst.mockResolvedValue({ id: 'addr_1', userId: 'user_a' });
		addressUpdate.mockResolvedValue({ id: 'addr_1', userId: 'user_a', city: 'Paris' });

		const { updateAddress } = await import('./addresses');
		const result = await updateAddress('addr_1', { city: 'Paris' } as never, 'user_a');

		expect(addressUpdate).toHaveBeenCalledWith({
			where: { id: 'addr_1' },
			data: { city: 'Paris' }
		});
		expect(result).toEqual({ id: 'addr_1', userId: 'user_a', city: 'Paris' });
	});

	it('sans ownerId (rétro-compatibilité), met à jour sans vérification de propriétaire', async () => {
		addressUpdate.mockResolvedValue({ id: 'addr_1', city: 'Lyon' });

		const { updateAddress } = await import('./addresses');
		const result = await updateAddress('addr_1', { city: 'Lyon' } as never);

		expect(addressFindFirst).not.toHaveBeenCalled();
		expect(addressUpdate).toHaveBeenCalledWith({ where: { id: 'addr_1' }, data: { city: 'Lyon' } });
		expect(result).toEqual({ id: 'addr_1', city: 'Lyon' });
	});
});
