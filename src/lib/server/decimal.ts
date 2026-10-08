/**
 * Conversion `Prisma.Decimal` → `number` JS brut, à appeler immédiatement
 * après chaque lecture Prisma d'un champ monétaire `@db.Decimal(10,2)`
 * (cf. RESTE_A_FAIRE.md §A.2.1 — migration Float → Decimal). Un objet
 * `Decimal` ne doit jamais remonter au-delà du point de lecture : il n'est
 * pas sérialisable par `devalue` (retour `load()`/action SvelteKit) et son
 * API diffère de `number` (opérateurs arithmétiques, comparaisons...).
 */
import type { Prisma } from '@prisma/client';

export function toNumber(value: Prisma.Decimal | number): number;
export function toNumber(value: Prisma.Decimal | number | null): number | null;
export function toNumber(value: Prisma.Decimal | number | null | undefined): number | null;
export function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	return typeof value === 'number' ? value : value.toNumber();
}
