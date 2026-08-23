/**
 * Codes promo.
 *
 * PROMO-PLUGIN : hors COMMERCE. `validatePromo` est encore appelé au checkout.
 */
import { prisma } from '$lib/server';
import type { PromoType } from '@prisma/client';

type PromoInput = {
	code: string;
	type: PromoType;
	value: number;
	minAmount?: number | null;
	usageLimit?: number | null;
	expiresAt?: string | null;
	active: boolean;
};

const normalizeCode = (code: string) => code.trim().toUpperCase();

export const getAllPromoCodes = async () => {
	return await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
};

export const getPromoCodeById = async (id: string) => {
	return await prisma.promoCode.findUnique({ where: { id } });
};

export const getPromoCodeByCode = async (code: string) => {
	return await prisma.promoCode.findUnique({ where: { code: normalizeCode(code) } });
};

export const createPromoCode = async (data: PromoInput) => {
	return await prisma.promoCode.create({
		data: {
			code: normalizeCode(data.code),
			type: data.type,
			value: data.value,
			minAmount: data.minAmount ?? null,
			usageLimit: data.usageLimit ?? null,
			expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
			active: data.active
		}
	});
};

export const updatePromoCode = async (id: string, data: PromoInput) => {
	return await prisma.promoCode.update({
		where: { id },
		data: {
			code: normalizeCode(data.code),
			type: data.type,
			value: data.value,
			minAmount: data.minAmount ?? null,
			usageLimit: data.usageLimit ?? null,
			expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
			active: data.active
		}
	});
};

export const deletePromoCode = async (id: string) => {
	return await prisma.promoCode.delete({ where: { id } });
};

export const incrementUsage = async (id: string) => {
	return await prisma.promoCode.update({
		where: { id },
		data: { usageCount: { increment: 1 } }
	});
};

export type ValidatePromoResult = {
	valid: boolean;
	reason?: string;
	discountAmount: number;
	promo: Awaited<ReturnType<typeof getPromoCodeByCode>>;
};

/**
 * Source de vérité côté serveur : valide un code promo et calcule la remise.
 * La remise s'applique sur le total TTC des produits (hors frais de port).
 */
export const validatePromo = async (
	rawCode: string | undefined | null,
	productTotalTTC: number
): Promise<ValidatePromoResult> => {
	const code = normalizeCode(rawCode ?? '');
	if (!code) {
		return { valid: false, reason: 'Aucun code fourni', discountAmount: 0, promo: null };
	}

	const promo = await getPromoCodeByCode(code);
	if (!promo) {
		return { valid: false, reason: 'Code promo introuvable', discountAmount: 0, promo: null };
	}
	if (!promo.active) {
		return { valid: false, reason: 'Ce code promo est inactif', discountAmount: 0, promo };
	}
	if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
		return { valid: false, reason: 'Ce code promo a expiré', discountAmount: 0, promo };
	}
	if (promo.usageLimit != null && promo.usageCount >= promo.usageLimit) {
		return {
			valid: false,
			reason: "Ce code promo a atteint sa limite d'utilisation",
			discountAmount: 0,
			promo
		};
	}
	if (promo.minAmount != null && productTotalTTC < promo.minAmount) {
		return {
			valid: false,
			reason: `Montant minimum de ${promo.minAmount.toFixed(2)}€ requis`,
			discountAmount: 0,
			promo
		};
	}

	let discount =
		promo.type === 'PERCENTAGE'
			? (productTotalTTC * promo.value) / 100
			: Math.min(promo.value, productTotalTTC);

	discount = Math.min(discount, productTotalTTC);
	discount = parseFloat(discount.toFixed(2));

	return { valid: true, discountAmount: discount, promo };
};
