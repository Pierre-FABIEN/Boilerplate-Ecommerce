import type { PageServerLoad } from './$types';
import { redirect, type Actions } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { updateUserAndAddressSchema } from '$lib/schema/addresses/updateUserAndAddressSchema';
import { getUsersById, updateUserMFA, updateUserRole } from '$lib/prisma/user/user';
import { getUserAddresses, updateAddress } from '$lib/prisma/addresses/addresses';
import { serializeData } from '$lib/utils/serializeData';
import { updateUserSecurity } from '$lib/prisma/user/updateUserSecurity';

export const load: PageServerLoad = async ({ params, locals }) => {
	// AUTH-PLUGIN ▼ cette page expose et modifie la fiche d'un autre utilisateur :
	// elle exige la connexion ET le rôle administrateur. Une redirection est
	// nécessaire ici, `fail()` n'ayant aucun effet dans un `load`.
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	if (locals.role !== 'ADMIN') {
		throw redirect(302, '/');
	}
	// AUTH-PLUGIN ▲

	// console.log('Loading user data for ID:', params.id);

	// 📌 Récupération des informations utilisateur et adresses associées
	const userFetched = await getUsersById(params.id);
	const addressesFetched = await getUserAddresses(params.id);

	// console.log(userFetched, 'userFetched');
	// console.log(addressesFetched, 'addressesFetched');

	// ⚠️ Vérification si l'utilisateur existe
	if (!userFetched) {
		// console.log('User not found');
		return fail(404, { message: 'User not found' });
	}

	// ✅ Sérialisation des données utilisateur
	const userSelected = serializeData(userFetched);

	// ✅ Préparation des données initiales pour le formulaire
	const initialData = {
		id: userSelected.id,
		role: userSelected.role || 'USER',
		isMfaEnabled: userSelected.isMfaEnabled ?? false,
		passwordHash: '',
		addresses: addressesFetched.map((address) => ({
			id: address.id,
			first_name: address.first_name,
			last_name: address.last_name,
			phone: address.phone,
			company: address.company ?? '',
			street_number: address.street_number,
			street: address.street,
			city: address.city,
			county: address.county ?? '',
			state: address.state ?? '',
			stateLetter: address.stateLetter,
			state_code: address.state_code ?? '',
			zip: address.zip,
			country: address.country,
			country_code: address.country_code,
			ISO_3166_1_alpha_3: address.ISO_3166_1_alpha_3,
			type: address.type,
			userId: address.userId, // Ajouté pour respecter le schéma
			createdAt: address.createdAt ?? new Date(),
			updatedAt: address.updatedAt ?? new Date()
		}))
	};

	// 📜 Validation des données initiales avec Superform + Zod
	const IupdateUserAndAddressSchema = await superValidate(
		initialData,
		zod(updateUserAndAddressSchema)
	);

	return {
		IupdateUserAndAddressSchema,
		userSelected
	};
};

export const actions: Actions = {
	updateUserAndAddresses: async ({ request }) => {
		// console.log('updateUserAndAddresses action initiated.');

		const formData = await request.formData();
		// console.log('Received form data:', formData);

		const jsonData = formData.get('__superform_json');
		if (!jsonData) {
			return fail(400, { message: 'Invalid form data' });
		}

		let parsedData;
		try {
			parsedData = JSON.parse(jsonData.toString());
			// console.log('Parsed JSON Data:', parsedData);
		} catch (error) {
			console.error('Error parsing JSON data:', error);
			return fail(400, { message: 'Invalid JSON data' });
		}

		// Ajustement de l'extraction des données en fonction de la structure reçue
		const userId = parsedData[1]; // Vérifie si c'est bien ici que se trouve l'ID utilisateur
		const userRole = parsedData[2];
		const isMfaEnabled = parsedData[3];
		const passwordHash = parsedData[4] ? parsedData[4].trim() : null;

		// Correction de la récupération des adresses
		const addressesIndexes = parsedData[5];
		const addresses = Array.isArray(addressesIndexes)
			? addressesIndexes.map((index: number) => ({
					id: parsedData[index + 1],
					first_name: parsedData[index + 2],
					last_name: parsedData[index + 3],
					phone: parsedData[index + 4],
					company: parsedData[index + 5],
					street_number: parsedData[index + 6],
					street: parsedData[index + 7],
					city: parsedData[index + 8],
					county: parsedData[index + 9],
					state: parsedData[index + 10],
					stateLetter: parsedData[index + 11],
					state_code: parsedData[index + 12],
					zip: parsedData[index + 13],
					country: parsedData[index + 14],
					country_code: parsedData[index + 15],
					ISO_3166_1_alpha_3: parsedData[index + 16],
					type: parsedData[index + 17],
					userId: userId,
					createdAt: new Date(parsedData[index + 18][1]), // Conversion en Date
					updatedAt: new Date(parsedData[index + 19][1])
				}))
			: [];

		const finalData = {
			id: userId,
			role: userRole,
			isMfaEnabled,
			passwordHash,
			addresses
		};

		// console.log('Structured data:', finalData);

		// Validation avec Zod
		const form = await superValidate(finalData, zod(updateUserAndAddressSchema));
		if (!form.valid) {
			// console.log('Validation errors:', form.errors);
			return fail(400, { form });
		}

		try {
			const { id, role, isMfaEnabled, passwordHash, addresses } = form.data;
			// console.log('Updating user and addresses with ID:', id, 'and role:', role);

			// Vérifier si l'utilisateur existe
			const user = await getUsersById(id);
			if (!user) {
				return fail(404, { message: 'User not found' });
			}

			// 1. Mise à jour du rôle utilisateur
			await updateUserRole(id, role);

			// 2. Mise à jour de la sécurité (MFA & mot de passe chiffré)
			if (passwordHash !== null && passwordHash.trim() !== '') {
				await updateUserSecurity(id, { isMfaEnabled, passwordHash });
			} else {
				// Met à jour uniquement le MFA si le password est vide ou nul
				await updateUserMFA(id, { isMfaEnabled });
			}

			// 3. Mise à jour des adresses
			await Promise.all(
				addresses.map((address) =>
					updateAddress(address.id, {
						userId: id,
						first_name: address.first_name,
						last_name: address.last_name,
						phone: address.phone,
						company: address.company,
						street_number: address.street_number,
						street: address.street,
						city: address.city,
						county: address.county,
						state: address.state,
						stateLetter: address.stateLetter,
						state_code: address.state_code,
						zip: address.zip,
						country: address.country,
						country_code: address.country_code,
						ISO_3166_1_alpha_3: address.ISO_3166_1_alpha_3,
						type: address.type,
						updatedAt: new Date() // Mise à jour automatique
					})
				)
			);

			// console.log('User and addresses updated successfully');
			return message(form, 'User and addresses updated successfully');
		} catch (error) {
			console.error('Error updating user and addresses:', error);
			return fail(500, { message: 'User and addresses update failed' });
		}
	}
};
