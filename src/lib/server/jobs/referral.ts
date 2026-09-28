/**
 * Récompense de parrainage, sortie du chemin synchrone du webhook Stripe
 * (même mécanique que `loyalty.ts`) : à la toute première commande payée
 * d'un compte parrainé (`User.referredById`), le parrain reçoit une carte
 * cadeau (module Gift Cards, réutilisé tel quel — `createGiftCard`).
 * `StoreSettings.referralEnabled` est vérifié par l'appelant (webhook) avant
 * d'enfiler ce job, pas ici.
 *
 * Coût maîtrisé : une seule récompense par filleul, jamais à ses commandes
 * suivantes — garanti par la contrainte unique `ReferralReward.referredId`.
 */
import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { withDuration } from '$lib/server/metrics';
import { createGiftCard } from '$lib/prisma/giftCards/giftCards';

/** Carte cadeau accordée au parrain — montant fixe, pas de config admin. */
export const REFERRAL_REWARD_AMOUNT = 10;

export async function runReferralRewardJob(orderId: string): Promise<void> {
	await withDuration('job.referral-reward', () =>
		withLock(`referral-reward:${orderId}`, 30, async () => {
			const order = await prisma.order.findUnique({
				where: { id: orderId },
				select: { id: true, userId: true, status: true }
			});
			if (!order) {
				log('WARN', 'referral-reward', `Commande introuvable: ${orderId}`);
				return;
			}
			if (order.status !== 'PAID') {
				log('WARN', 'referral-reward', `Commande non payée, vérification ignorée: ${orderId}`);
				return;
			}

			const referredUser = await prisma.user.findUnique({
				where: { id: order.userId },
				select: { id: true, referredById: true }
			});
			if (!referredUser?.referredById) return; // pas un compte parrainé

			// Une seule récompense par filleul, à sa toute première commande payée.
			const paidOrderCount = await prisma.order.count({
				where: { userId: referredUser.id, status: 'PAID' }
			});
			if (paidOrderCount !== 1) return;

			const already = await prisma.referralReward.findUnique({
				where: { referredId: referredUser.id }
			});
			if (already) return;

			const referrer = await prisma.user.findUnique({
				where: { id: referredUser.referredById },
				select: { id: true, email: true }
			});
			if (!referrer) return;

			const giftCard = await prisma.$transaction(async (tx) => {
				// §2.3 de l'audit : les deux écritures doivent réussir ou échouer
				// ensemble, sinon une carte cadeau créée sans son `ReferralReward`
				// devient orpheline (introuvable par un retry, qui en recrée une
				// seconde) — même famille de garantie que `loyalty.ts`, ici via une
				// transaction plutôt qu'un rollback manuel après coup.
				const giftCard = await createGiftCard(
					{
						initialValue: REFERRAL_REWARD_AMOUNT,
						recipientEmail: referrer.email,
						note: `Parrainage — filleul ${referredUser.id}`
					},
					tx
				);

				await tx.referralReward.create({
					data: {
						referrerId: referrer.id,
						referredId: referredUser.id,
						giftCardId: giftCard.id
					}
				});

				return giftCard;
			});

			await sendMail({
				to: referrer.email,
				subject: 'Votre filleul a passé commande 🎉',
				text: `Merci pour votre parrainage ! Votre filleul vient de passer sa première commande : vous recevez une carte cadeau de ${giftCard.initialValue.toFixed(2)} €, à utiliser avec le code ${giftCard.code} lors de votre prochaine commande.`,
				html: `<p>Merci pour votre parrainage !</p><p>Votre filleul vient de passer sa première commande : vous recevez une carte cadeau de <strong>${giftCard.initialValue.toFixed(2)} €</strong>, à utiliser avec le code <strong>${giftCard.code}</strong> lors de votre prochaine commande.</p>`
			});

			log('INFO', 'referral-reward', 'Récompense de parrainage accordée', {
				referrerId: referrer.id,
				referredId: referredUser.id,
				giftCardId: giftCard.id
			});
		})
	);
}
