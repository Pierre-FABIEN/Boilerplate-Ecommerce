import type { UpdateAddressSchema } from '$lib/schema/addresses/addressSchema';
import { prisma } from '$lib/server';

// ✅ Récupérer toutes les adresses d'un utilisateur
export const getUserAddresses = async (userId: string) => {
	try {
		return await prisma.address.findMany({
			where: { userId }
		});
	} catch (error) {
		console.error('Error fetching user addresses:', error);
		throw error;
	}
};

// ✅ Supprimer une adresse par ID
export const deleteAddress = async (addressId: string, userId: string) => {
	try {
		return await prisma.address.deleteMany({
			where: { id: addressId, userId }
		});
	} catch (error) {
		console.error('Error deleting address:', error);
		throw error;
	}
};

// ✅ Récupérer une adresse spécifique par ID
export const getAddressById = async (addressId: string) => {
	try {
		return await prisma.address.findUnique({
			where: { id: addressId }
		});
	} catch (error) {
		console.error('Error fetching address by ID:', error);
		throw error;
	}
};

export const updateAddress = async (
	id: string,
	data: Omit<UpdateAddressSchema, 'id'>,
	ownerId?: string
) => {
	try {
		if (ownerId) {
			const owned = await prisma.address.findFirst({ where: { id, userId: ownerId } });
			if (!owned) return null;
		}
		return await prisma.address.update({
			where: { id },
			data
		});
	} catch (error) {
		console.error('❌ Error updating address:', error);
		throw error;
	}
};

// ✅ Créer une nouvelle adresse
export const createAddress = async (data: Omit<UpdateAddressSchema, 'id'> & { userId: string }) => {
	try {
		return await prisma.address.create({ data });
	} catch (error) {
		console.error('Error creating address:', error);
		throw error;
	}
};
