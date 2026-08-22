import { prisma } from '$lib/server';

export const createEmailVerificationRequestPrisma = async (data: {
	id: string;
	userId: string;
	code: string;
	email: string;
	expiresAt: Date;
}) => {
	return await prisma.emailVerificationRequest.create({
		data
	});
};

export const deleteEmailVerificationRequestsByUserId = async (userId: string) => {
	return await prisma.emailVerificationRequest.deleteMany({
		where: { userId }
	});
};

export const findEmailVerificationRequest = async (id: string, userId: string) => {
	// findFirst et non findUnique : (id, userId) n'est pas une contrainte unique,
	// userId sert ici de garde-fou d'appartenance.
	return await prisma.emailVerificationRequest.findFirst({
		where: {
			id: id,
			userId: userId
		}
	});
};
