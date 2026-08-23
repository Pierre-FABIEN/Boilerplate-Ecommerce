// Configuration SEO pour MadeInDiamonds
export const seoConfig = {
	// Informations de base du site
	site: {
		name: 'MadeInDiamonds',
		url: 'https://madeindiamonds.com',
		description:
			'MadeInDiamonds — studio web. Sites vitrines, e-commerce, identité visuelle et applications sur-mesure.',
		keywords:
			'studio web, agence web, site vitrine, e-commerce, identité visuelle, application web, MadeInDiamonds',
		author: 'MadeInDiamonds',
		locale: 'fr_FR'
	},

	// Métadonnées par défaut
	defaults: {
		title: 'MadeInDiamonds — Studio web & identités digitales',
		description:
			'Découvrez MadeInDiamonds, studio web spécialisé dans les sites vitrines, boutiques en ligne, identités visuelles et applications sur-mesure.',
		keywords:
			'studio web, agence web, site vitrine, e-commerce, identité visuelle, application web, MadeInDiamonds',
		image: '/og-default.jpg',
		type: 'website'
	},

	// Configuration des pages principales
	pages: {
		home: {
			title: 'MadeInDiamonds — Studio web & identités digitales',
			description:
				'Découvrez MadeInDiamonds, studio web spécialisé dans les sites vitrines, boutiques en ligne, identités visuelles et applications sur-mesure.',
			keywords:
				'studio web, agence web, site vitrine, e-commerce, identité visuelle, MadeInDiamonds',
			image: '/og-home.jpg'
		},
		blog: {
			title: 'Blog — Design, produit et culture web',
			description:
				'Actualités, retours d’expérience et conseils du studio MadeInDiamonds sur le design, le développement et la stratégie digitale.',
			keywords: 'blog studio web, design, UX, développement, actualités MadeInDiamonds',
			image: '/og-blog.jpg'
		},
		catalogue: {
			title: 'Offres — Prestations du studio MadeInDiamonds',
			description:
				'Explorez nos offres : site vitrine, e-commerce, identité visuelle, application web et maintenance.',
			keywords: 'offres studio web, site vitrine, e-commerce, identité visuelle, application web',
			image: '/og-catalogue.jpg'
		},
		contact: {
			title: 'Contact — Parlons de votre projet MadeInDiamonds',
			description:
				'Contactez le studio MadeInDiamonds pour un site, une identité ou une application. Discutons de votre brief.',
			keywords: 'contact studio web, devis, projet digital, MadeInDiamonds',
			image: '/og-contact.jpg'
		},
		checkout: {
			title: 'Commande — Finalisez votre projet MadeInDiamonds',
			description:
				'Finalisez votre commande de prestation MadeInDiamonds. Paiement sécurisé et confirmation par e-mail.',
			keywords: 'commande studio web, paiement sécurisé, projet digital, MadeInDiamonds',
			image: '/og-checkout.jpg'
		},
		checkoutSuccess: {
			title: 'Commande confirmée — MadeInDiamonds',
			description: 'Votre commande MadeInDiamonds a été confirmée. Merci pour votre confiance.',
			keywords: 'commande confirmée, succès, MadeInDiamonds',
			image: '/og-checkout-success.jpg'
		},
		error: {
			title: 'Page non trouvée — MadeInDiamonds',
			description:
				'La page que vous recherchez n’existe pas. Retournez à l’accueil pour découvrir le studio MadeInDiamonds.',
			keywords: 'page non trouvée, erreur 404, MadeInDiamonds, studio web',
			image: '/og-error.jpg'
		},
		auth: {
			title: 'Authentification — MadeInDiamonds',
			description:
				'Connectez-vous à votre compte MadeInDiamonds pour suivre vos projets et vos commandes.',
			keywords: 'connexion, authentification, compte, MadeInDiamonds',
			image: '/og-auth.jpg'
		},
		admin: {
			title: 'Administration — MadeInDiamonds',
			description: 'Panneau d’administration MadeInDiamonds. Gérez vos offres, commandes et utilisateurs.',
			keywords: 'administration, gestion, offres, commandes, utilisateurs, MadeInDiamonds',
			image: '/og-admin.jpg'
		}
	},

	// Configuration des réseaux sociaux
	social: {
		twitter: {
			site: '@madeindiamonds',
			creator: '@madeindiamonds'
		},
		facebook: {
			appId: 'votre-app-id-facebook'
		}
	}
};
