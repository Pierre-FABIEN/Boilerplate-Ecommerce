import { z } from 'zod';

// Type de remise : pourcentage ou montant fixe
const promoTypeEnum = z.enum(['PERCENTAGE', 'FIXED']);

// Champs communs create / update
const basePromoSchema = z.object({
	code: z.string().min(1, 'Le code est requis'),
	type: promoTypeEnum,
	value: z.number({ invalid_type_error: 'La valeur est requise' }).min(0, 'La valeur doit être positive'),
	minAmount: z.number().min(0, 'Le montant minimum doit être positif').optional(),
	usageLimit: z.number().int('Nombre entier attendu').min(0, "La limite doit être positive").optional(),
	expiresAt: z.string().optional(),
	active: z.boolean()
});

// Schéma de création
const createPromoSchema = basePromoSchema;

// Schéma de mise à jour
const updatePromoSchema = basePromoSchema.extend({
	id: z.string()
});

// Schéma de suppression
const deletePromoSchema = z.object({
	id: z.string()
});

type CreatePromo = z.infer<typeof createPromoSchema>;
type UpdatePromo = z.infer<typeof updatePromoSchema>;
type DeletePromo = z.infer<typeof deletePromoSchema>;

export { createPromoSchema, updatePromoSchema, deletePromoSchema };
export type { CreatePromo, UpdatePromo, DeletePromo };
