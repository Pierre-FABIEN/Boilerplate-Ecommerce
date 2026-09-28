import type { PageServerLoad } from './$types';
import { error, type Actions } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { updateUserAndAddressSchema } from '$lib/schema/addresses/updateUserAndAddressSchema';
import { getUsersById, updateUserMFA, updateUserRole } from '$lib/prisma/user/user';
import { getUserAddresses, updateAddress } from '$lib/prisma/addresses/addresses';
import { serializeData } from '$lib/utils/serializeData';
import { updateUserSecurity } from '$lib/prisma/user/updateUserSecurity';
import { invalidateUserSessions } from '$lib/lucia/session';
import { assertAdmin, requireAdmin } from '$lib/admin/guards';
import { logAdminAction } from '$lib/server/audit-log';
import { findSessionsForUser } from '$lib/prisma/session/sessions';
import { describeUserAgent } from '$lib/lucia/deviceLabel';

/**
 * Fiche d'un utilisateur : rôle, 2FA, mot de passe, adresses.
 *
 * Le rôle n'accepte que les valeurs de l'enum Prisma (`ADMIN` | `CLIENT`).
 * Un mot de passe vide laisse l'existant intact.
 */

export const load: PageServerLoad = async ({ params, locals }) => {
	assertAdmin(locals);

	// console.log('Loading user data for ID:', params.id);

	// 📌 Récupération des informations utilisateur et adresses associées
	const [userFetched, addressesFetched, sessionsFetched] = await Promise.all([
		getUsersById(params.id),
		getUserAddresses(params.id),
		findSessionsForUser(params.id)
	]);

	// console.log(userFetched, 'userFetched');
	// console.log(addressesFetched, 'addressesFetched');

	if (!userFetched) {
		error(404, 'User not found');
	}

	// ✅ Sérialisation des données utilisateur
	const userSelected = serializeData(userFetched);

	// ✅ Préparation des données initiales pour le formulaire
	const initialData = {
		id: userSelected.id,
		role: userSelected.role || 'CLIENT',
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
		userSelected,
		// Lecture seule côté admin — la déconnexion à distance reste réservée au
		// self-service (`/auth/settings/sessions`), voir FEATURE_IDEAS.md.
		sessions: sessionsFetched.map((session) => ({
			id: session.id,
			// `null` = session ouverte avant l'ajout de ce suivi, voir le même
			// commentaire dans /auth/settings/sessions/+page.server.ts.
			device: session.userAgent ? describeUserAgent(session.userAgent) : null,
			city: session.city,
			country: session.country,
			ipAddress: session.ipAddress,
			createdAt: session.createdAt,
			lastActiveAt: session.lastActiveAt
		}))
	};
};

export const actions: Actions = {
	updateUserAndAddresses: async ({ request, locals }) => {
		requireAdmin(locals);
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
					userId: userId,
					createdAt: new Date(parsedData[index + 17][1]), // Conversion en Date
					updatedAt: new Date(parsedData[index + 18][1])
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
			if (user.role !== role) {
				await updateUserRole(id, role);
				await logAdminAction({
					actorId: locals.user.id,
					action: 'user.role-change',
					targetType: 'User',
					targetId: id,
					metadata: { from: user.role, to: role }
				});
			}

			// 2. Mise à jour de la sécurité (MFA & mot de passe chiffré)
			if (passwordHash != null && passwordHash.trim() !== '') {
				await updateUserSecurity(id, { isMfaEnabled, passwordHash });
			} else {
				// Met à jour uniquement le MFA si le password est vide ou nul
				await updateUserMFA(id, { isMfaEnabled });
			}

			// Un nouveau mot de passe ou un changement de MFA ne servent à rien
			// si une session déjà ouverte sur ce compte reste valide (attaquant
			// avec un cookie volé, ou compte qu'on cherche justement à reprendre
			// en main) — même geste que l'action self-service équivalente
			// (`auth/settings` action `password`), mais sans recréer de session
			// ici : c'est le compte de quelqu'un d'autre, pas celui de l'admin.
			const passwordChanged = passwordHash != null && passwordHash.trim() !== '';
			if (passwordChanged || isMfaEnabled !== user.isMfaEnabled) {
				await invalidateUserSessions(id);
			}

			// 3. Mise à jour des adresses
			await Promise.all(
				addresses.map((address) =>
					// ownerId = id (compte cible) : garde-fou de cohérence (§4.3
					// audit) — vérifie que l'adresse appartient bien au compte en
					// cours d'édition avant d'écrire, au cas où un id d'adresse
					// altéré/mal formé serait soumis dans le formulaire.
					updateAddress(
						address.id,
						{
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
							updatedAt: new Date() // Mise à jour automatique
						},
						id
					)
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
