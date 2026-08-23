<script lang="ts">
	import { page } from '$app/stores';
	import { seoConfig } from '$lib/seo.config';
	import StructuredData from './StructuredData.svelte';
	
	interface SEOProps {
		title?: string;
		description?: string;
		keywords?: string;
		image?: string;
		url?: string;
		type?: 'website' | 'article' | 'product';
		publishedTime?: string;
		modifiedTime?: string;
		author?: string;
		section?: string;
		tags?: string[];
		noindex?: boolean;
		nofollow?: boolean;
		pageKey?: keyof typeof seoConfig.pages;
	}
	
	let { 
		title,
		description,
		keywords,
		image,
		url,
		type = 'website',
		publishedTime,
		modifiedTime,
		author,
		section,
		tags = [],
		noindex = false,
		nofollow = false,
		pageKey
	}: SEOProps = $props();
	
	// Utiliser la configuration par défaut si pageKey est fourni
	const finalTitle = $derived(title || (pageKey ? seoConfig.pages[pageKey].title : seoConfig.defaults.title));
	const finalDescription = $derived(description || (pageKey ? seoConfig.pages[pageKey].description : seoConfig.defaults.description));
	const finalKeywords = $derived(keywords || (pageKey ? seoConfig.pages[pageKey].keywords : seoConfig.defaults.keywords));
	const finalImage = $derived(image || (pageKey ? seoConfig.pages[pageKey].image : seoConfig.defaults.image));
	const finalAuthor = $derived(author || seoConfig.site.author);
	
	// Construire l'URL canonique
	const canonicalUrl = $derived(url || `${seoConfig.site.url}${$page.url.pathname}`);
	
	// Construire le titre complet
	const fullTitle = $derived(finalTitle === seoConfig.defaults.title ? finalTitle : `${finalTitle} | ${seoConfig.site.name}`);
	
	// Construire les robots meta
	const robotsContent = $derived([
		noindex ? 'noindex' : 'index',
		nofollow ? 'nofollow' : 'follow'
	].join(', '));
	
	// Données structurées pour l'organisation
	const organizationData = {
		name: seoConfig.site.name,
		url: seoConfig.site.url,
		logo: {
			"@type": "ImageObject",
			url: `${seoConfig.site.url}/logo.png`
		},
		description: seoConfig.site.description,
		sameAs: [
			"https://www.instagram.com/madeindiamonds/",
			"https://www.facebook.com/madeindiamonds/",
			"https://www.linkedin.com/company/madeindiamonds/"
		]
	};
	
	// Données structurées pour le site web
	const websiteData = $derived({
		name: fullTitle,
		description: finalDescription,
		url: canonicalUrl,
		publisher: {
			"@type": "Organization",
			...organizationData
		}
	});
	
	// Données structurées pour les articles
	const articleData = $derived(type === 'article' ? {
		...websiteData,
		author: {
			"@type": "Person",
			name: finalAuthor
		},
		...(publishedTime && { datePublished: publishedTime }),
		...(modifiedTime && { dateModified: modifiedTime }),
		...(section && { articleSection: section }),
		...(tags.length > 0 && { keywords: tags.join(', ') })
	} : null);
</script>

<svelte:head>
	<!-- Métadonnées de base -->
	<title>{fullTitle}</title>
	<meta name="description" content={finalDescription} />
	<meta name="keywords" content={finalKeywords} />
	<meta name="author" content={finalAuthor} />
	<meta name="robots" content={robotsContent} />
	
	<!-- Canonical -->
	<link rel="canonical" href={canonicalUrl} />
	
	<!-- Open Graph / Facebook -->
	<meta property="og:type" content={type} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={finalDescription} />
	<meta property="og:image" content={finalImage.startsWith('http') ? finalImage : `${seoConfig.site.url}${finalImage}`} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:site_name" content={seoConfig.site.name} />
	<meta property="og:locale" content={seoConfig.site.locale} />
	
	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={finalDescription} />
	<meta name="twitter:image" content={finalImage.startsWith('http') ? finalImage : `${seoConfig.site.url}${finalImage}`} />
	<meta name="twitter:site" content={seoConfig.social.twitter.site} />
	<meta name="twitter:creator" content={seoConfig.social.twitter.creator} />
	
	<!-- Métadonnées spécifiques aux articles -->
	{#if type === 'article' && publishedTime}
		<meta property="article:published_time" content={publishedTime} />
	{/if}
	
	{#if type === 'article' && modifiedTime}
		<meta property="article:modified_time" content={modifiedTime} />
	{/if}
	
	{#if type === 'article' && finalAuthor}
		<meta property="article:author" content={finalAuthor} />
	{/if}
	
	{#if type === 'article' && section}
		<meta property="article:section" content={section} />
	{/if}
	
	{#if type === 'article' && tags.length > 0}
		{#each tags as tag}
			<meta property="article:tag" content={tag} />
		{/each}
	{/if}
</svelte:head>

<!-- Données structurées -->
<StructuredData type="Organization" data={organizationData} />
<StructuredData type="WebSite" data={websiteData} />

{#if type === 'article' && articleData}
	<StructuredData type="Article" data={articleData} />
{/if}
