import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `consumeSessionRevokeToken` est ce qui protège le lien « Ce n'était pas
 * moi » (accessible sans authentification) contre la réutilisation et
 * l'expiration — deux propriétés à vérifier explicitement puisqu'une
 * régression ici serait silencieuse (le lien continuerait à "marcher" pour
 * un attaquant qui le rejoue).
 */

const sessionRevokeTokenDelete = vi.fn();
const sessionRevokeTokenFindUnique = vi.fn();

vi.mock('$lib/server', () => ({
	prisma: {
		sessionRevokeToken: {
			delete: (...args: unknown[]) => sessionRevokeTokenDelete(...args),
			findUnique: (...args: unknown[]) => sessionRevokeTokenFindUnique(...args)
		}
	}
}));

import { consumeSessionRevokeToken, peekSessionRevokeToken } from './sessionRevokeToken';

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

beforeEach(() => {
	vi.clearAllMocks();
});

describe('consumeSessionRevokeToken', () => {
	it('jeton valide, non expiré → renvoie userId/sessionId et le supprime', async () => {
		sessionRevokeTokenDelete.mockResolvedValue({
			id: 'tok_1',
			userId: 'user_1',
			sessionId: 'sess_1',
			expiresAt: FUTURE
		});

		const result = await consumeSessionRevokeToken('tok_1');

		expect(result).toEqual({ userId: 'user_1', sessionId: 'sess_1' });
		expect(sessionRevokeTokenDelete).toHaveBeenCalledWith({ where: { id: 'tok_1' } });
	});

	it('jeton déjà utilisé (delete échoue, ligne absente) → null, jamais d’erreur qui remonte', async () => {
		sessionRevokeTokenDelete.mockRejectedValue(new Error('Record to delete does not exist.'));

		const result = await consumeSessionRevokeToken('tok-deja-utilise');

		expect(result).toBeNull();
	});

	it('jeton expiré (mais encore présent) → null, malgré la suppression déjà effectuée', async () => {
		sessionRevokeTokenDelete.mockResolvedValue({
			id: 'tok_2',
			userId: 'user_1',
			sessionId: 'sess_1',
			expiresAt: PAST
		});

		const result = await consumeSessionRevokeToken('tok_2');

		expect(result).toBeNull();
	});
});

describe('peekSessionRevokeToken', () => {
	it('jeton valide → renvoie les infos sans jamais appeler delete', async () => {
		sessionRevokeTokenFindUnique.mockResolvedValue({
			id: 'tok_3',
			userId: 'user_1',
			sessionId: 'sess_1',
			expiresAt: FUTURE
		});

		const result = await peekSessionRevokeToken('tok_3');

		expect(result).toEqual({ userId: 'user_1', sessionId: 'sess_1' });
		expect(sessionRevokeTokenDelete).not.toHaveBeenCalled();
	});

	it('jeton inconnu → null', async () => {
		sessionRevokeTokenFindUnique.mockResolvedValue(null);

		expect(await peekSessionRevokeToken('inconnu')).toBeNull();
	});

	it('jeton expiré → null', async () => {
		sessionRevokeTokenFindUnique.mockResolvedValue({
			id: 'tok_4',
			userId: 'user_1',
			sessionId: 'sess_1',
			expiresAt: PAST
		});

		expect(await peekSessionRevokeToken('tok_4')).toBeNull();
	});
});
