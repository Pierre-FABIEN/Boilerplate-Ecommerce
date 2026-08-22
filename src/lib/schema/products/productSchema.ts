import { z } from 'zod';

const MAX_FILE_SIZE = 1024 * 1024 * 1;
const ACCEPTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Regular expression for hexadecimal color validation
const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// Schema for creating a product
const createProductSchema = z.object({
  name: z.string().min(3, 'Name is required and should be at least 3 characters long'),
  description: z
    .string()
    .min(3, 'Description is required and should be at least 3 characters long'),
  price: z.number().positive('Price must be a positive number'),
  stock: z.number().int().nonnegative('Stock must be a non-negative integer'),
  categoryId: z
    .array(z.string().min(1, 'Category ID must be a non-empty string'))
    .nonempty('At least one category ID is required'),
  images: z
    .array(z.instanceof(File))
    .refine((files) => files.length > 0, 'At least one image is required.')
    .refine(
      (files) => files.every((file) => file.size <= MAX_FILE_SIZE),
      `Max image size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
    )
    .refine(
      (files) => files.every((file) => ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)),
      'Only .jpg, .jpeg, .png and .webp formats are supported.'
    ),
  slug: z.string().optional(),
  colorProduct: z
    .string()
    .regex(hexColorRegex, 'Color must be a valid hexadecimal color code') // Validate color
});

// Schema for updating a product
const updateProductSchema = z.object({
  _id: z.string(),
  name: z.string().min(3, 'Name is required and should be at least 3 characters long'),
  description: z
    .string()
    .min(3, 'Description is required and should be at least 3 characters long'),
  price: z.number().positive('Price must be a positive number'),
  stock: z.number().int().nonnegative('Stock must be a non-negative integer'),
  categoryId: z
    .array(z.string().min(1, 'Category ID must be a non-empty string'))
    .nonempty('At least one category ID is required'),
  images: z
    .array(z.instanceof(File))
    .optional()
    .refine(
      (files) => !files || files.every((file) => file.size <= MAX_FILE_SIZE),
      `Max image size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
    )
    .refine(
      (files) => !files || files.every((file) => ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)),
      'Only .jpg, .jpeg, .png and .webp formats are supported.'
    ),
  existingImages: z.array(z.string()),
  colorProduct: z
    .string()
    .regex(hexColorRegex, 'Color must be a valid hexadecimal color code') // Validate color
});

// Schema for deleting a product
const deleteProductSchema = z.object({
  _id: z.string()
});

// TypeScript types inferred from the Zod schemas
type CreateProduct = z.infer<typeof createProductSchema>;
type UpdateProduct = z.infer<typeof updateProductSchema>;
type DeleteProduct = z.infer<typeof deleteProductSchema>;

export { createProductSchema, updateProductSchema, deleteProductSchema };
export type { CreateProduct, UpdateProduct, DeleteProduct };
