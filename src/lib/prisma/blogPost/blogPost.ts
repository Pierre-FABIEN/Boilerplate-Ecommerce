import { prisma } from '$lib/server';

/**
 * BLOG-PLUGIN : DAO Prisma des articles, catégories et tags. Les lectures
 * publiques passent par `src/lib/blog/catalog.ts` (filtre `published`).
 */

export const getAllPosts = async () => {
	try {
		const posts = await prisma.blogPost.findMany({
			include: {
				author: true,
				category: true,
				tags: {
					include: {
						tag: true
					}
				}
			}
		});

		// console.log('All posts:', posts);

		return posts;
	} catch (error) {
		console.error('Error retrieving posts:', error);
	}
};

export const getPostBySlug = async (slug: string) => {
	try {
		const post = await prisma.blogPost.findUnique({
			where: { slug },
			include: {
				author: true,
				category: true
			}
		});
		return post;
	} catch (error) {
		console.error('Error retrieving post:', error);
	}
};

export const updatePost = async (data: {
	id: string;
	title: string;
	content: string;
	authorId: string;
	categoryId: string;
	tagIds: string[];
	published: boolean;
}) => {
	try {
		return await prisma.$transaction(async (tx) => {
			// Mise à jour des champs du post
			const post = await tx.blogPost.update({
				where: { id: data.id },
				data: {
					title: data.title,
					content: data.content,
					categoryId: data.categoryId,
					published: data.published
					// On peut mettre à jour d'autres champs si nécessaire
				}
			});

			// Supprimer les relations existantes dans BlogPostTag pour ce post
			await tx.blogPostTag.deleteMany({
				where: { postId: data.id }
			});

			// Créer les nouvelles relations pour les tags
			if (data.tagIds && data.tagIds.length > 0) {
				await Promise.all(
					data.tagIds.map(async (tagId) => {
						await tx.blogPostTag.create({
							data: {
								postId: data.id,
								tagId: tagId
							}
						});
					})
				);
			}

			return post;
		});
	} catch (error) {
		console.error('Error updating post:', error);
		throw error;
	}
};

export const getPostById = async (id: string) => {
	try {
		const post = await prisma.blogPost.findUnique({
			where: { id },
			include: {
				author: true,
				tags: true
			}
		});
		return post;
	} catch (error) {
		console.error('Error retrieving post:', error);
	}
};

// createPost.ts
// Cette fonction crée un post en enregistrant également la catégorie et les tags associés,
// en gérant séparément les relations puisque les nested writes ne sont pas supportées avec MongoDB.
export const createPost = async (
	title: string,
	content: string,
	authorId: string,
	slug: string,
	published: boolean,
	categoryId?: string,
	tagIds?: string[]
) => {
	try {
		// Création du post principal en assignant directement categoryId
		const post = await prisma.blogPost.create({
			data: {
				title,
				content,
				authorId,
				slug,
				published,
				createdAt: new Date(),
				// On affecte directement la clé étrangère
				categoryId: categoryId ? categoryId : null
			}
		});

		// Si des tags sont fournis, on crée une entrée dans BlogPostTag pour chacun
		if (tagIds && tagIds.length > 0) {
			await Promise.all(
				tagIds.map(async (tagId) => {
					await prisma.blogPostTag.create({
						data: {
							postId: post.id,
							tagId: tagId
						}
					});
				})
			);
		}

		return post;
	} catch (error) {
		console.error('Error creating post:', error);
		throw error;
	}
};

export const deletePost = async (id: string) => {
	// console.log('Deleting post with id:', id);
	try {
		// Utiliser une transaction pour supprimer d'abord les relations, puis le post
		const deletedPost = await prisma.$transaction(async (tx) => {
			// 1. Supprimer toutes les entrées liées dans BlogPostTag
			await tx.blogPostTag.deleteMany({
				where: { postId: id }
			});

			// 2. Supprimer le post
			const post = await tx.blogPost.delete({
				where: { id }
			});
			return post;
		});

		// console.log('Post deleted successfully:', deletedPost);
		return deletedPost;
	} catch (error) {
		console.error('Error deleting post:', error);
		throw error;
	}
};

// CATEGORIES
// Récupérer une catégorie par ID
export const getCategoryById = async (id: string) => {
	try {
		return await prisma.blogCategory.findUnique({
			where: { id }
		});
	} catch (error) {
		console.error('Error retrieving category by ID:', error);
		throw error;
	}
};

// Créer une nouvelle catégorie
export const createCategory = async (name?: string, description?: string) => {
	try {
		return await prisma.blogCategory.create({
			data: {
				name: name ?? '',
				description: description
			}
		});
	} catch (error) {
		console.error('Error creating category:', error);
		throw error;
	}
};

// Mettre à jour une catégorie existante
export const updateCategory = async (id: string, data: { name?: string; description?: string }) => {
	try {
		return await prisma.blogCategory.update({
			where: { id },
			data
		});
	} catch (error) {
		console.error('Error updating category:', error);
		throw error;
	}
};

// Supprimer une catégorie
export const deleteCategory = async (id: string) => {
	try {
		await prisma.$transaction(async (prisma) => {
			// Re-assigner les posts à `null` avant de supprimer la catégorie
			await prisma.blogPost.updateMany({
				where: { categoryId: id },
				data: { categoryId: null }
			});

			// Supprimer la catégorie
			return prisma.blogCategory.delete({
				where: { id }
			});
		});
		return 'Category deleted successfully';
	} catch (error) {
		console.error('Error deleting category:', error);
		throw error;
	}
};

// Récupérer toutes les catégories avec les posts associés
export const getAllCategoriesPosts = async () => {
	try {
		return await prisma.blogCategory.findMany({
			include: {
				posts: true
			}
		});
	} catch (error) {
		console.error('Error retrieving categories with posts:', error);
		throw error;
	}
};

// TAGS
// Récupérer un tag par ID
export const getTagById = async (id: string) => {
	try {
		return await prisma.blogTag.findUnique({
			where: { id }
		});
	} catch (error) {
		console.error('Error retrieving tag by ID:', error);
		throw error;
	}
};

// Créer un nouveau tag
export const createTag = async (name: string) => {
	try {
		return await prisma.blogTag.create({
			data: {
				name
			}
		});
	} catch (error) {
		console.error('Error creating tag:', error);
		throw error;
	}
};

// Mettre à jour un tag existant
export const updateTag = async (id: string, data: { name?: string }) => {
	try {
		return await prisma.blogTag.update({
			where: { id },
			data
		});
	} catch (error) {
		console.error('Error updating tag:', error);
		throw error;
	}
};

// Supprimer un tag
export const deleteTag = async (id: string) => {
	try {
		await prisma.$transaction(async (prisma) => {
			// Supprimer toutes les entrées BlogPostTag liées au tag
			await prisma.blogPostTag.deleteMany({
				where: { tagId: id }
			});

			// Supprimer le tag
			return prisma.blogTag.delete({
				where: { id }
			});
		});
		return 'Tag deleted successfully';
	} catch (error) {
		console.error('Error deleting tag:', error);
		throw error;
	}
};

// Récupérer tous les tags avec les posts associés
export const getAllTagsPosts = async () => {
	try {
		return await prisma.blogTag.findMany({
			include: {
				posts: {
					include: {
						post: true
					}
				}
			}
		});
	} catch (error) {
		console.error('Error retrieving tags with posts:', error);
		throw error;
	}
};
