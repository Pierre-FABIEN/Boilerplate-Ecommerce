import { z } from 'zod';
import { Role } from '@prisma/client';

const updateUserSchema = z.object({
	id: z.string(),
	name: z.string().min(1, 'Name is required'),
	email: z.string().email('Invalid email format'),
	role: z.nativeEnum(Role)
});

// Schéma pour la suppression d'un utilisateur
const deleteUserSchema = z.object({
	id: z.string()
});

type UpdateUser = z.infer<typeof updateUserSchema>;
type DeleteUser = z.infer<typeof deleteUserSchema>;

export { updateUserSchema, deleteUserSchema };
export type { UpdateUser, DeleteUser };
