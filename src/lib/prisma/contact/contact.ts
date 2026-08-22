import { prisma } from '$lib/server';
import type { ContactSubmission } from '@prisma/client';

type CreateContactSubmissionData = Omit<ContactSubmission, 'id' | 'createdAt' | 'updatedAt'>;

export const createContactSubmission = async (data: CreateContactSubmissionData) => {
	try {
		const submission = await prisma.contactSubmission.create({
			data: {
				...data
			}
		});
		return submission;
	} catch (error) {
		console.error('Error creating contact submission:', error);
		throw new Error('Could not create contact submission.');
	}
};

export const getAllContactSubmissions = async () => {
	try {
		const submissions = await prisma.contactSubmission.findMany({
			orderBy: {
				createdAt: 'desc'
			}
		});
		return submissions;
	} catch (error) {
		console.error('Error retrieving contact submissions:', error);
		throw new Error('Could not retrieve contact submissions.');
	}
};

export const getContactSubmissionById = async (id: string) => {
	try {
		const submission = await prisma.contactSubmission.findUnique({
			where: { id }
		});
		return submission;
	} catch (error) {
		console.error('Error retrieving contact submission:', error);
		throw new Error('Could not retrieve contact submission.');
	}
};
