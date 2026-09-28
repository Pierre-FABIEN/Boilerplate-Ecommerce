import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §2.3 de l'audit fonctionnel : la carte cadeau de récompense était créée
 * PUIS le `ReferralReward` qui la référence dans un appel séparé — si ce
 * second appel échouait (timeout DB), la carte cadeau existait déjà mais
 * orpheline (aucun retry ne la retrouve, un second passage en recrée une
 * autre). Ce test prouve que `createGiftCard` participe désormais à la même
 * transaction Prisma que `referralReward.create` (même client `tx` passé
 * aux deux), et qu'un échec du second fait échouer tout le job plutôt que de
 * laisser la carte cadeau survivre seule.
 */

const orderFindUnique = vi.fn();
const orderCount = vi.fn();
const userFindUnique = vi.fn();
const referralRewardFindUnique = vi.fn();
const referralRewardCreate = vi.fn();
const txClient = { referralReward: { create: referralRewardCreate } };
const transaction = vi.fn((callback: (tx: typeof txClient) => Promise<unknown>) =>
	callback(txClient)
);

vi.mock('$lib/server', () => ({
	prisma: {
		order: { findUnique: orderFindUnique, count: orderCount },
		user: { findUnique: userFindUnique },
		referralReward: { findUnique: referralRewardFindUnique },
		$transaction: (callback: (tx: typeof txClient) => Promise<unknown>) => transaction(callback)
	}
}));

const createGiftCard = vi.fn();
vi.mock('$lib/prisma/giftCards/giftCards', () => ({
	createGiftCard: (...args: unknown[]) => createGiftCard(...args)
}));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock('$lib/server/smtp-mail', () => ({ sendMail }));

const order = { id: 'order_1', userId: 'user_referred', status: 'PAID' };
const referredUser = { id: 'user_referred', referredById: 'user_referrer' };
const referrer = { id: 'user_referrer', email: 'referrer@example.test' };

describe('runReferralRewardJob — atomicité carte cadeau / ReferralReward (§2.3)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		orderFindUnique.mockResolvedValue(order);
		orderCount.mockResolvedValue(1);
		referralRewardFindUnique.mockResolvedValue(null);
		userFindUnique.mockResolvedValueOnce(referredUser).mockResolvedValueOnce(referrer);
		transaction.mockImplementation((callback: (tx: typeof txClient) => Promise<unknown>) =>
			callback(txClient)
		);
	});

	it('crée la carte cadeau avec le même client `tx` que le `ReferralReward`, dans une seule transaction', async () => {
		createGiftCard.mockResolvedValue({ id: 'gift_1', code: 'GIFT-TEST', initialValue: 10 });
		referralRewardCreate.mockResolvedValue({ id: 'reward_1' });

		const { runReferralRewardJob } = await import('./referral');
		await expect(runReferralRewardJob(order.id)).resolves.toBeUndefined();

		expect(transaction).toHaveBeenCalledTimes(1);
		expect(createGiftCard).toHaveBeenCalledWith(
			expect.objectContaining({ recipientEmail: referrer.email }),
			txClient
		);
		expect(referralRewardCreate).toHaveBeenCalledWith({
			data: { referrerId: referrer.id, referredId: referredUser.id, giftCardId: 'gift_1' }
		});
		expect(sendMail).toHaveBeenCalledTimes(1);
	});

	it('ne persiste jamais la carte cadeau seule : un échec du ReferralReward fait échouer tout le job', async () => {
		createGiftCard.mockResolvedValue({ id: 'gift_2', code: 'GIFT-ORPHAN', initialValue: 10 });
		referralRewardCreate.mockRejectedValue(new Error('DB timeout'));

		const { runReferralRewardJob } = await import('./referral');
		await expect(runReferralRewardJob(order.id)).rejects.toThrow('DB timeout');

		expect(createGiftCard).toHaveBeenCalledWith(expect.anything(), txClient);
		expect(sendMail).not.toHaveBeenCalled();
	});
});
