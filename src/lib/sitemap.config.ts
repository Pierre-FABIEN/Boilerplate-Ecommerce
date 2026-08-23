// Configuration du sitemap
export const sitemapConfig = {
	// URL de base du site
	site: 'https://madeindiamonds.com', // Domaine MadeInDiamonds
	
	// Routes à exclure du sitemap (routes privées, admin, auth)
	excludedRoutes: [
		'/auth', // AUTH-PLUGIN : à retirer si le module d'authentification disparaît
		'/admin', // ADMIN-PLUGIN : à retirer si le module d'administration disparaît
		'/checkout', // COMMERCE-PLUGIN
		'/sitemap.xml',
		'/api',
		'/+page.svelte' // Fichier technique
	],
	
	// Configuration des priorités et fréquences par type de route
	routeConfig: {
		'/': { priority: '1.0', changefreq: 'daily' },
		'/products': { priority: '0.9', changefreq: 'weekly' }, // PRODUCT-PLUGIN
		'/blog': { priority: '0.8', changefreq: 'weekly' }, // BLOG-PLUGIN
		'/contact': { priority: '0.7', changefreq: 'monthly' } // CONTACT-PLUGIN
	},
	
	// Configuration par défaut pour les routes non configurées
	defaultConfig: {
		priority: '0.5',
		changefreq: 'weekly'
	}
};
