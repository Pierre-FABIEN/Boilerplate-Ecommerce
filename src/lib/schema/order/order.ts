import { z } from 'zod';

export const OrderSchema = z.object({
  orderId: z.string().min(1, "L'ID de commande est requis"),
  addressId: z.string().min(1, "L'adresse est requise"),
  shippingOption: z.string().optional(),
  shippingCost: z.string().optional(),

  // Code promo appliqué (optionnel)
  promoCode: z.string().optional(),
  discountAmount: z.string().optional(),

  // Champs plats pour les informations du point relais
  servicePointId: z.string().optional(),
  servicePointPostNumber: z.string().optional(),
  servicePointLatitude: z.string().optional(),
  servicePointLongitude: z.string().optional(),
  servicePointType: z.string().nullable().optional(),
  servicePointExtraRefCab: z.string().optional(),
  servicePointExtraShopRef: z.string().optional()
});

export type OrderSchemaType = z.infer<typeof OrderSchema>;
