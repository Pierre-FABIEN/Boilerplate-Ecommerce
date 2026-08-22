// src/routes/your-route/+page.server.ts
import type { PageServerLoad } from './$types';
import { type Actions } from '@sveltejs/kit';
import { superValidate, fail, message, withFiles } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import cloudinary from '$lib/server/cloudinary';
import { createProductSchema } from '$lib/schema/products/productSchema';
import { slugify } from '$lib/prisma/slugify';
import { connectProductToCategories, createProduct } from '$lib/prisma/products/products';
import { getAllcategories, getCategoriesByIds } from '$lib/prisma/categories/categories';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async () => {
	const IcreateProductSchema = await superValidate(zod(createProductSchema));
	const categories = await getAllcategories();

	return {
		categories,
		IcreateProductSchema
	};
};

export const actions: Actions = {
	createProduct: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();

		const form = await superValidate(formData, zod(createProductSchema));

		if (!form.valid) {
			return fail(400, withFiles({ form }));
		}

		const images = formData.getAll('images') as File[];

		const uploadedImageUrls: string[] = [];

		for (const image of images) {
			if (image instanceof File) {
				try {
					const buffer = await image.arrayBuffer();
					const base64String = Buffer.from(buffer).toString('base64');

					const uploadResponse = await cloudinary.uploader.upload(
						`data:${image.type};base64,${base64String}`,
						{
							folder: 'products'
						}
					);

					uploadedImageUrls.push(uploadResponse.secure_url);
				} catch (error) {
					console.error('Error uploading image:', error);
					return fail(500, { message: 'Image upload failed' });
				}
			}
		}

		const categoryIdsString = formData.get('categoryId') as string;
		const categoryIds = categoryIdsString.split(',').map((id) => id.trim());

		const existingCategories = await getCategoriesByIds(categoryIds);

		const existingCategoryIds = existingCategories.map((cat) => cat.id);

		const missingCategories = categoryIds.filter((id) => !existingCategoryIds.includes(id));

		if (missingCategories.length > 0) {
			return fail(400, {
				message: `The following categories do not exist: ${missingCategories.join(', ')}`
			});
		}

		const slug = slugify(form.data.name);

		try {
			const product = await createProduct({
				name: form.data.name,
				description: form.data.description,
				price: form.data.price,
				stock: form.data.stock,
				images: uploadedImageUrls,
				slug: slug,
				colorProduct: form.data.colorProduct
			});

			await connectProductToCategories(product.id, existingCategoryIds);
			// console.log(form);

			return message(form, 'Product created successfully');
		} catch (error) {
			console.error('Error creating product:', error);
			return fail(500, { message: 'Product creation failed' });
		}
	}
};
