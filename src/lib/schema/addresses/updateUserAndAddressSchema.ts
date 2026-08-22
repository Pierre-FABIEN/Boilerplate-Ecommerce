import { z } from 'zod';
import { Role } from '@prisma/client';

// Enum to differentiate Shipping and Billing addresses
export const AddressTypeEnum = z.enum(['SHIPPING', 'BILLING']);

// Schéma de validation pour une adresse complète
const addressSchema = z.object({
	id: z.string(),
	first_name: z.string().min(2, 'Le prénom est requis').max(50, 'Le prénom est trop long'),
	last_name: z.string().min(2, 'Le nom est requis').max(50, 'Le nom est trop long'),
	phone: z
		.string()
		.min(10, 'Le numéro de téléphone est requis')
		.max(15, 'Le numéro de téléphone est trop long')
		.regex(/^\+?[0-9]{7,15}$/, 'Numéro de téléphone invalide'),
	company: z.string().max(100).optional(),
	street_number: z.string().min(1, 'Numéro de rue requis').max(10),
	street: z.string().min(3, 'La rue est requise').max(255),
	city: z.string().min(2, 'La ville est requise').max(100),
	county: z.string().min(2, 'Le département est requis').max(100),
	state: z.string().min(2, 'La région est requise').max(100),
	stateLetter: z.string().length(2, 'Format invalide (ex: FR, US, CA)'),
	state_code: z.string().min(2, 'Code région requis').max(10),
	zip: z
		.string()
		.min(3, 'Le code postal est requis')
		.max(20, 'Le code postal est trop long')
		.regex(/^[0-9A-Za-z- ]+$/, 'Format de code postal invalide'),
	country: z.string().min(2, 'Le pays est requis').max(100),
	country_code: z.string().length(2, 'Format invalide (ex: FR, US, DE)'),
	ISO_3166_1_alpha_3: z.string().length(3, 'Format invalide (ex: FRA, USA, CAN)'),
	type: AddressTypeEnum, // SHIPPING ou BILLING
	userId: z.string(), // L'adresse doit être liée à un utilisateur
	createdAt: z.date().optional(),
	updatedAt: z.date().optional()
});

// Schema for user and address update validation
const updateUserAndAddressSchema = z.object({
	id: z.string(),
	role: z.nativeEnum(Role),
	isMfaEnabled: z.boolean(),
	passwordHash: z.string().nullable().optional(),
	addresses: z.array(addressSchema)
});

// TypeScript type definitions
type UpdateUserAndAddress = z.infer<typeof updateUserAndAddressSchema>;

export { updateUserAndAddressSchema, addressSchema };
export type { UpdateUserAndAddress };
