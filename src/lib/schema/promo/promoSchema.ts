/** PROMO-PLUGIN : schémas Zod des formulaires admin. */
import { z } from 'zod';

// Type de remise : pourcentage ou montant fixe
const promoTypeEnum = z.enum(['PERCENTAGE', 'FIXED']);

// Champs communs create / update
const basePromoSchema = z.object({
	code: z.string().min(1, 'Le code est requis'),
	type: promoTypeEnum,
	value: z
		.number({ invalid_type_error: 'La valeur est requise' })
		.min(0, 'La valeur doit être positive'),
	minAmount: z.number().min(0, 'Le montant minimum doit être positif').optional(),
	usageLimit: z
		.number()
		.int('Nombre entier attendu')
		.min(0, 'La limite doit être positive')
		.optional(),
	expiresAt: z.string().optional(),
	active: z.boolean(),
	// PROMO-PLUGIN / fidélité : ce code est accordé automatiquement au compte
	// qui atteint ce nombre de commandes payées (voir StoreSettings.loyaltyEnabled).
	loyaltyThreshold: z
		.number()
		.int('Nombre entier attendu')
		.min(1, 'Le seuil doit être au moins 1')
		.optional()
});

/**
 * `validatePromo` plafonne déjà la remise au total de la commande : une valeur
 * aberrante ne produit jamais de facture négative, elle se comporte
 * silencieusement comme 100 %. On refuse la saisie plutôt que de laisser
 * croire à une remise de 500 %.
 */
const percentageWithinBounds = (
	data: { type: z.infer<typeof promoTypeEnum>; value: number },
	ctx: z.RefinementCtx
) => {
	if (data.type === 'PERCENTAGE' && data.value > 100) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['value'],
			message: 'Une remise en pourcentage ne peut pas dépasser 100.'
		});
	}
};

// Schéma de création
const createPromoSchema = basePromoSchema.superRefine(percentageWithinBounds);

// Schéma de mise à jour
const updatePromoSchema = basePromoSchema
	.extend({
		id: z.string()
	})
	.superRefine(percentageWithinBounds);

// Schéma de suppression
const deletePromoSchema = z.object({
	id: z.string()
});

type CreatePromo = z.infer<typeof createPromoSchema>;
type UpdatePromo = z.infer<typeof updatePromoSchema>;
type DeletePromo = z.infer<typeof deletePromoSchema>;

export { createPromoSchema, updatePromoSchema, deletePromoSchema };
export type { CreatePromo, UpdatePromo, DeletePromo };
