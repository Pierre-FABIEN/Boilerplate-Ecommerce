/**
 * Cartes cadeaux — solde décroissant, même esprit que les codes promo
 * (PROMO-PLUGIN : `$lib/prisma/promo/promo.ts`) mais avec un solde qui
 * survit à plusieurs utilisations partielles au lieu d'un compteur
 * d'utilisation. Activable/désactivable via `StoreSettings.giftCardsEnabled`.
 */
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server';
import { toNumber } from '$lib/server/decimal';
import { normalizeListParams, type ListParams } from '$lib/prisma/pagination';

type CreateGiftCardInput = {
	initialValue: number;
	recipientEmail?: string | null;
	note?: string | null;
	expiresAt?: string | null;
};

type UpdateGiftCardInput = {
	active: boolean;
	recipientEmail?: string | null;
	note?: string | null;
	expiresAt?: string | null;
};

const GIFT_CARD_SORTABLE = ['code', 'initialValue', 'balance', 'expiresAt', 'createdAt'] as const;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus (0/O, 1/I/L)

const normalizeCode = (code: string) => code.trim().toUpperCase();

/** `initialValue`/`balance` sont des `Decimal` Prisma : jamais renvoyés tels
 *  quels (non sérialisables par `devalue`, arithmétique incompatible avec
 *  `number`) — voir RESTE_A_FAIRE.md §A.2.1. */
function mapGiftCard<T extends { initialValue: Prisma.Decimal; balance: Prisma.Decimal }>(
	giftCard: T
): Omit<T, 'initialValue' | 'balance'> & { initialValue: number; balance: number } {
	return {
		...giftCard,
		initialValue: toNumber(giftCard.initialValue),
		balance: toNumber(giftCard.balance)
	};
}

function randomSegment(length: number): string {
	const bytes = randomBytes(length);
	let segment = '';
	for (let i = 0; i < length; i++) {
		segment += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	}
	return segment;
}

/** `GIFT-XXXX-XXXX-XXXX`, retire une collision improbable en retentant. */
async function generateUniqueGiftCardCode(
	client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = `GIFT-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
		const existing = await client.giftCard.findUnique({ where: { code } });
		if (!existing) return code;
	}
	throw new Error('Impossible de générer un code de carte cadeau unique');
}

/** Liste paginée pour `/admin/gift-cards` : recherche sur le code, tri sur les colonnes affichées. */
export const getAllGiftCards = async (params: ListParams = {}) => {
	const { page, perPage, skip, search, sort, dir } = normalizeListParams(params, {
		perPage: 20,
		defaultSort: 'createdAt',
		sortable: GIFT_CARD_SORTABLE
	});

	const where = search
		? { code: { contains: normalizeCode(search), mode: 'insensitive' as const } }
		: undefined;

	const [items, total] = await Promise.all([
		prisma.giftCard.findMany({
			where,
			orderBy: { [sort]: dir },
			skip,
			take: perPage
		}),
		prisma.giftCard.count({ where })
	]);
	return { items: items.map(mapGiftCard), total, page, perPage, search, sort, dir };
};

export const getGiftCardById = async (id: string) => {
	const giftCard = await prisma.giftCard.findUnique({ where: { id } });
	return giftCard ? mapGiftCard(giftCard) : null;
};

export const getGiftCardByCode = async (code: string) => {
	const giftCard = await prisma.giftCard.findUnique({ where: { code: normalizeCode(code) } });
	return giftCard ? mapGiftCard(giftCard) : null;
};

/**
 * `tx` optionnel (§2.3 de l'audit fonctionnel) : à passer quand la création
 * doit rester atomique avec une autre écriture liée (ex. `ReferralReward` —
 * voir `$lib/server/jobs/referral.ts`), pour qu'un échec de cette dernière
 * fasse aussi disparaître la carte cadeau au lieu de la laisser orpheline.
 */
export const createGiftCard = async (
	data: CreateGiftCardInput,
	tx: Prisma.TransactionClient | typeof prisma = prisma
) => {
	const code = await generateUniqueGiftCardCode(tx);
	const giftCard = await tx.giftCard.create({
		data: {
			code,
			initialValue: data.initialValue,
			balance: data.initialValue,
			recipientEmail: data.recipientEmail || null,
			note: data.note || null,
			expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
		}
	});
	return mapGiftCard(giftCard);
};

/**
 * Ne touche jamais `code`/`initialValue`/`balance` : la valeur d'une carte
 * est fixée à l'émission, seul son statut/métadonnées sont modifiables ici.
 * Un ajustement de solde volontaire (SAV) passe par `adjustGiftCardBalance`,
 * geste distinct et explicite plutôt qu'un champ parmi d'autres du formulaire.
 */
export const updateGiftCard = async (id: string, data: UpdateGiftCardInput) => {
	const giftCard = await prisma.giftCard.update({
		where: { id },
		data: {
			active: data.active,
			recipientEmail: data.recipientEmail || null,
			note: data.note || null,
			expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
		}
	});
	return mapGiftCard(giftCard);
};

/** Ajustement manuel du solde (SAV : geste commercial, remboursement partiel...). */
export const adjustGiftCardBalance = async (id: string, newBalance: number) => {
	const giftCard = await prisma.giftCard.update({
		where: { id },
		data: { balance: Math.max(0, newBalance) }
	});
	return mapGiftCard(giftCard);
};

export const deleteGiftCard = async (id: string) => {
	return await prisma.giftCard.delete({ where: { id } });
};

export type ValidateGiftCardResult = {
	valid: boolean;
	reason?: string;
	amount: number;
	giftCard: Awaited<ReturnType<typeof getGiftCardByCode>>;
};

/**
 * Source de vérité côté serveur : valide une carte cadeau et calcule le
 * montant réellement applicable, plafonné par `maxApplicable` (le reste à
 * payer une fois la remise éventuelle d'un code promo déjà déduite).
 */
export const validateGiftCard = async (
	rawCode: string | undefined | null,
	maxApplicable: number
): Promise<ValidateGiftCardResult> => {
	const code = normalizeCode(rawCode ?? '');
	if (!code) {
		return { valid: false, reason: 'Aucun code fourni', amount: 0, giftCard: null };
	}

	const giftCard = await getGiftCardByCode(code);
	if (!giftCard) {
		return { valid: false, reason: 'Carte cadeau introuvable', amount: 0, giftCard: null };
	}
	if (!giftCard.active) {
		return { valid: false, reason: 'Cette carte cadeau est inactive', amount: 0, giftCard };
	}
	if (giftCard.expiresAt && giftCard.expiresAt.getTime() < Date.now()) {
		return { valid: false, reason: 'Cette carte cadeau a expiré', amount: 0, giftCard };
	}
	if (giftCard.balance <= 0) {
		return {
			valid: false,
			reason: 'Le solde de cette carte cadeau est épuisé',
			amount: 0,
			giftCard
		};
	}

	const amount = parseFloat(Math.min(giftCard.balance, Math.max(0, maxApplicable)).toFixed(2));

	return { valid: true, amount, giftCard };
};

/**
 * Décrémente le solde après usage ; désactive la carte quand le solde est
 * épuisé. À appeler dans la même transaction que la confirmation du
 * paiement (webhook `checkout.session.completed`), jamais avant : `tx` est
 * requis, pas de valeur par défaut sur `prisma` global (même convention que
 * `nextInvoiceNumber`/`nextCreditNoteNumber`).
 *
 * `updateMany` + garde `balance: { gte: amount }` rend la décrémentation
 * atomique : deux commandes concurrentes sur la même carte ne peuvent plus
 * lire le même solde de départ et en perdre une (l'une des deux ne matche
 * plus la garde et renvoie `null`, à traiter comme un solde insuffisant).
 */
export const decrementGiftCardBalance = async (
	tx: Prisma.TransactionClient,
	id: string,
	amount: number
) => {
	const amountRounded = parseFloat(amount.toFixed(2));
	const { count } = await tx.giftCard.updateMany({
		where: { id, balance: { gte: amountRounded } },
		data: { balance: { decrement: amountRounded } }
	});
	if (count === 0) return null;

	const updated = await tx.giftCard.findUnique({ where: { id } });
	if (!updated) return null;
	if (updated.balance.lte(0) && updated.active) {
		const deactivated = await tx.giftCard.update({ where: { id }, data: { active: false } });
		return mapGiftCard(deactivated);
	}
	return mapGiftCard(updated);
};
