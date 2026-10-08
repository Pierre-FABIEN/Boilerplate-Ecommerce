/**
 * `Transaction` a 6 champs `Decimal` (`amount`, `disputeAmount`,
 * `shippingCost`, `subtotalHt`, `taxAmount`, `discountAmount`) — jamais
 * renvoyés tels quels au-delà du point de lecture Prisma (non sérialisables
 * par `devalue`, arithmétique incompatible avec `number`). Voir
 * RESTE_A_FAIRE.md §A.2.1. Record plat (pas de relation imbriquée à
 * convertir), d'où un mapper unique réutilisé par tous les points de lecture
 * (find, create, update), quel que soit le fichier.
 */
import type { Prisma } from '@prisma/client';
import { toNumber } from '$lib/server/decimal';

export function mapTransaction<
	T extends {
		amount: Prisma.Decimal;
		disputeAmount: Prisma.Decimal | null;
		shippingCost: Prisma.Decimal;
		subtotalHt: Prisma.Decimal;
		taxAmount: Prisma.Decimal;
		discountAmount: Prisma.Decimal;
	}
>(transaction: T) {
	return {
		...transaction,
		amount: toNumber(transaction.amount),
		disputeAmount: toNumber(transaction.disputeAmount),
		shippingCost: toNumber(transaction.shippingCost),
		subtotalHt: toNumber(transaction.subtotalHt),
		taxAmount: toNumber(transaction.taxAmount),
		discountAmount: toNumber(transaction.discountAmount)
	};
}
