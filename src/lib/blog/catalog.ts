// -----------------------------------------------------------------------------
// Lecture publique du blog.
//
// Point d'entrée de la vitrine : uniquement les articles `published`. Les
// brouillons restent dans le CRUD admin. Retirer le module, pour ce fichier,
// se résume à ne plus appeler ces lecteurs depuis les routes `/blog`.
// BLOG-PLUGIN
// -----------------------------------------------------------------------------

import { prisma } from '$lib/server';

const publicPostInclude = {
	author: true,
	category: true,
	tags: {
		include: {
			tag: true
		}
	}
} as const;

export type PublicPost = Awaited<ReturnType<typeof listPublishedPosts>>[number];

/** Articles publiés, éventuellement filtrés par catégorie blog. */
export async function listPublishedPosts(categoryId?: string) {
	return prisma.blogPost.findMany({
		where: {
			published: true,
			...(categoryId ? { categoryId } : {})
		},
		include: publicPostInclude,
		orderBy: { createdAt: 'desc' }
	});
}

/** Fiche publique par slug, ou `null` si inconnu / non publié. */
export async function getPublishedPostBySlug(slug: string) {
	return prisma.blogPost.findFirst({
		where: { slug, published: true },
		include: publicPostInclude
	});
}

/** Catégories du blog, pour le filtre de la vitrine. */
export async function listBlogCategories() {
	return prisma.blogCategory.findMany({
		orderBy: { name: 'asc' }
	});
}
