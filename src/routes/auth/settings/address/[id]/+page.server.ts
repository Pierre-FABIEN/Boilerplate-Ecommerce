import { updateAddressSchema } from '$lib/schema/addresses/addressSchema';
import { zod } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { fail, message, superValidate } from 'sveltekit-superforms';
import { getAddressById, updateAddress } from '$lib/prisma/addresses/addresses';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		error(401, 'Unauthorized');
	}

	const address = await getAddressById(event.params.id);

	if (!address || address.userId !== event.locals.user.id) {
		error(404, 'Address not found');
	}

	const initialData = {
		id: address.id,
		first_name: address.first_name,
		last_name: address.last_name,
		phone: address.phone,
		company: address.company ?? '',
		street_number: address.street_number ?? '',
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
		type: address.type
	};

	const IupdateAddressSchema = await superValidate(initialData, zod(updateAddressSchema));

	return {
		IupdateAddressSchema
	};
};

export const actions: Actions = {
	updateAddress: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { message: 'Unauthorized' });
		}

		const formData = await request.formData();
		const form = await superValidate(formData, zod(updateAddressSchema));

		if (!form.valid) {
			return fail(400, { message: 'Validation failed', form });
		}

		const userId = locals.user.id;
		const id = form.data.id;
		const {
			first_name,
			last_name,
			phone,
			company,
			street_number,
			street,
			city,
			county,
			state,
			stateLetter,
			state_code,
			zip,
			country,
			country_code,
			ISO_3166_1_alpha_3,
			type
		} = form.data;

		try {
			const updated = await updateAddress(
				id,
				{
					userId,
					first_name,
					last_name,
					phone,
					company,
					street_number,
					street,
					city,
					county,
					state,
					stateLetter,
					state_code,
					zip,
					country,
					country_code,
					ISO_3166_1_alpha_3,
					type,
					updatedAt: new Date()
				},
				userId
			);
			if (!updated) {
				return fail(403, { message: 'Forbidden', form });
			}

			return message(form, 'Address updated successfully');
		} catch (err: unknown) {
			console.error('❌ Error updating address:', err);

			if (typeof err === 'object' && err && 'code' in err && err.code === 'P2025') {
				return fail(404, { message: 'Address not found', form });
			}

			return fail(500, { message: 'Address update failed', form });
		}
	}
};
