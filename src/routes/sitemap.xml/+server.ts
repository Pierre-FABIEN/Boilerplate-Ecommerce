import type { RequestHandler } from './$types';
import { sitemapConfig } from '$lib/sitemap.config';
import { prisma } from '$lib/server';

// Importer toutes les pages Svelte automatiquement
const pages = import.meta.glob('../**/+page.svelte', { eager: true });

// Fonction pour récupérer les articles du blog
const getBlogPosts = async () => {
	try {
		const posts = await prisma.blogPost.findMany({
			where: { published: true },
			select: {
				slug: true,
				updatedAt: true
			}
		});
		return posts;
	} catch (error) {
		console.error('Erreur lors de la récupération des articles:', error);
		return [];
	}
};

// PRODUCT-PLUGIN : pas de champ `published`/`visible` sur `Product` — tout
// produit créé est déjà navigable publiquement sur `/products/[slug]`
// (même en rupture, juste marqué « Épuisé »), donc tous inclus ici sans filtre.
const getProducts = async () => {
	try {
		const products = await prisma.product.findMany({
			select: {
				slug: true,
				updatedAt: true
			}
		});
		return products;
	} catch (error) {
		console.error('Erreur lors de la récupération des produits:', error);
		return [];
	}
};

// Fonction pour extraire les chemins des fichiers
const extractPaths = () => {
	const paths: Array<{ path: string; priority: string; changefreq: string }> = [];

	for (const path in pages) {
		// Extraire le chemin relatif
		let route = path.replace('../', '').replace('/+page.svelte', '');

		// Gérer les routes dynamiques (ex: [id], [slug])
		// Pour les routes dynamiques, on les exclut car on ne peut pas les lister toutes
		if (route.includes('[') && route.includes(']')) {
			continue;
		}

		// Ajouter une barre oblique au début
		if (!route.startsWith('/')) {
			route = `/${route}`;
		}

		// Vérifier si la route doit être exclue
		const shouldExclude = sitemapConfig.excludedRoutes.some((excludedRoute) => {
			// Exclure les routes qui commencent par les patterns exclus
			if (excludedRoute.endsWith('*')) {
				const pattern = excludedRoute.slice(0, -1);
				return route.startsWith(pattern);
			}
			// Exclure les routes exactes
			return route === excludedRoute || route.startsWith(excludedRoute + '/');
		});

		if (shouldExclude) {
			continue;
		}

		// Gérer la route racine
		if (route === '/index') {
			route = '/';
		}

		// Déterminer la priorité et la fréquence de changement
		let priority = sitemapConfig.defaultConfig.priority;
		let changefreq = sitemapConfig.defaultConfig.changefreq;

		// Chercher la configuration correspondante
		for (const [pattern, config] of Object.entries(sitemapConfig.routeConfig)) {
			if (route.startsWith(pattern)) {
				priority = config.priority;
				changefreq = config.changefreq;
				break;
			}
		}

		paths.push({ path: route, priority, changefreq });
	}

	return paths;
};

// Fonction pour échapper les caractères spéciaux XML
const escapeXml = (str: string): string => {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
};

// Fonction pour générer le sitemap XML
const generateSitemap = (
	paths: Array<{ path: string; priority: string; changefreq: string }>,
	blogPosts: Array<{ slug: string; updatedAt: Date }>,
	products: Array<{ slug: string; updatedAt: Date }>
) => {
	// Pas de `lastmod` sur les pages statiques : il valait `new Date()`, donc
	// chaque page se déclarait modifiée à l'instant, à chaque requête du
	// sitemap. Google apprend ainsi que ces dates ne veulent rien dire et cesse
	// de s'y fier — y compris pour les produits et articles, dont la date est
	// pourtant réelle. Le champ est facultatif : l'omettre vaut mieux que mentir.
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
${paths
	.map(
		({ path, priority, changefreq }) => `    <url>
        <loc>${escapeXml(sitemapConfig.site + path)}</loc>
        <changefreq>${escapeXml(changefreq)}</changefreq>
        <priority>${escapeXml(priority)}</priority>
    </url>`
	)
	.join('\n')}
${products
	.map(
		(product) => `    <url>
        <loc>${escapeXml(sitemapConfig.site + '/products/' + product.slug)}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
        <lastmod>${escapeXml(product.updatedAt.toISOString())}</lastmod>
    </url>`
	)
	.join('\n')}
${blogPosts
	.map(
		(post) => `    <url>
        <loc>${escapeXml(sitemapConfig.site + '/blog/' + post.slug)}</loc>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
        <lastmod>${escapeXml(post.updatedAt.toISOString())}</lastmod>
    </url>`
	)
	.join('\n')}
</urlset>`;
};

// Handler GET pour servir le sitemap
export const GET: RequestHandler = async () => {
	const paths = extractPaths();
	const [blogPosts, products] = await Promise.all([getBlogPosts(), getProducts()]);
	const body = generateSitemap(paths, blogPosts, products);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
