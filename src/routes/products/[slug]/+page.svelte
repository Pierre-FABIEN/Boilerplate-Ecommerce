<script lang="ts">
	import { untrack } from 'svelte';
	import { addToCart } from '$lib/store/Data/cartStore';
	import Button from '$shadcn/button/button.svelte';
	import { Textarea } from '$shadcn/textarea';
	import * as Form from '$shadcn/form';
	import { optimizedImageUrl } from '$lib/utils/cloudinaryUrl';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import { reviewSchema } from '$lib/schema/products/reviewSchema';
	import { askQuestionSchema } from '$lib/schema/products/questionSchema';
	import StarRating from '$lib/components/reviews/StarRating.svelte';
	import Heart from 'lucide-svelte/icons/heart';
	import * as Card from '$shadcn/card';
	import * as Select from '$shadcn/select';
	import { Badge } from '$shadcn/badge';
	import SEO from '$lib/components/SEO.svelte';
	import StructuredData from '$lib/components/StructuredData.svelte';
	import { seoConfig } from '$lib/seo.config';
	import { readRecentlyViewed, recordProductView } from '$lib/store/recentlyViewed';
	import FlashSaleCountdown from '$lib/components/products/FlashSaleCountdown.svelte';
	import QuantityInput from '$lib/components/QuantityInput.svelte';
	import { toTTC } from '$lib/utils/price';

	let { data } = $props();
	let product = $derived(data.product);

	let recentlyViewed = $state<ReturnType<typeof readRecentlyViewed>>([]);
	$effect(() => {
		// Capture la visite courante puis lit l'historique — dans cet ordre,
		// le produit affiché ici n'est jamais celui qu'on est déjà en train
		// de consulter (il vient d'être placé en tête, filtré juste après).
		recordProductView({
			id: product.id,
			slug: product.slug,
			name: product.name,
			price: product.price,
			image: product.images[0] ?? null
		});
		recentlyViewed = readRecentlyViewed().filter((item) => item.id !== product.id);
	});
	let categoryNames = $derived(
		product.categories.map((link) => link.category.name).filter(Boolean)
	);

	// Un seul niveau de catégorie (pas les taxonomies) : le catalogue filtre
	// désormais par taxonomies génériques, pas par `Category` ici — un lien
	// de fil d'Ariane qui ne filtrerait rien serait pire que pas de lien.
	let breadcrumbData = $derived({
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Accueil', item: seoConfig.site.url },
			{
				'@type': 'ListItem',
				position: 2,
				name: 'Nos bijoux',
				item: `${seoConfig.site.url}/products`
			},
			{
				'@type': 'ListItem',
				position: 3,
				name: product.name,
				item: `${seoConfig.site.url}/products/${product.slug}`
			}
		]
	});

	let inWishlist = $state(untrack(() => data.inWishlist));
	let wishlistBusy = $state(false);
	let hasDiscount = $derived(
		Boolean(product.compareAtPrice) && (product.compareAtPrice as number) > product.price
	);
	let discountPercent = $derived(
		hasDiscount ? Math.round((1 - product.price / (product.compareAtPrice as number)) * 100) : 0
	);

	async function toggleWishlist() {
		if (!data.user) {
			window.location.href = '/auth/login';
			return;
		}
		wishlistBusy = true;
		try {
			const res = await fetch('/api/wishlist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ productId: product.id })
			});
			if (res.ok) {
				const result = await res.json();
				inWishlist = result.inWishlist;
			}
		} finally {
			wishlistBusy = false;
		}
	}

	// STOCK_ALERT-PLUGIN : "Me prévenir" — bascule l'inscription à la file
	// d'attente de réassort, même patron que `toggleWishlist` ci-dessus.
	let stockAlertSubscribed = $state(untrack(() => data.stockAlertSubscribed));
	let stockAlertBusy = $state(false);

	async function toggleStockAlert() {
		if (!data.user) {
			window.location.href = '/auth/login';
			return;
		}
		stockAlertBusy = true;
		try {
			const res = await fetch('/api/stock-alerts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ productId: product.id })
			});
			if (res.ok) {
				const result = await res.json();
				stockAlertSubscribed = result.subscribed;
			}
		} finally {
			stockAlertBusy = false;
		}
	}

	// Variantes (`ProductVariant`) : un produit sans variante se comporte
	// exactement comme avant leur introduction (`selectedVariant` reste
	// `null`, jamais de sélection imposée).
	let selectedVariantId = $state<string | null>(untrack(() => product.variants[0]?.id ?? null));
	let selectedVariant = $derived(product.variants.find((v) => v.id === selectedVariantId) ?? null);
	let displayedPrice = $derived(selectedVariant?.price ?? product.price);
	let displayedStock = $derived(selectedVariant?.stock ?? product.stock);
	// Affichage uniquement — le panier reçoit toujours le prix HT (voir
	// addToCart plus bas), la TVA y est calculée séparément.
	let displayedPriceTTC = $derived(toTTC(displayedPrice, data.vatRate));
	let quantity = $state(1);

	function handleAddToCart() {
		if (product.variants.length > 0 && !selectedVariant) {
			toast.error('Choisissez une variante.');
			return;
		}
		if (displayedStock <= 0) {
			toast.error('Rupture de stock.');
			return;
		}
		const requestedQuantity = Math.trunc(quantity);
		if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) {
			toast.error('Quantité invalide.');
			return;
		}
		if (requestedQuantity > displayedStock) {
			toast.error(`Quantité indisponible (stock : ${displayedStock}).`);
			return;
		}

		addToCart({
			id: crypto.randomUUID(),
			product: {
				id: product.id,
				name: product.name,
				price: product.price,
				images: product.images[0] ?? '',
				stock: product.stock,
				weight: product.weight,
				length: product.length,
				width: product.width,
				height: product.height
			},
			variant: selectedVariant
				? {
						id: selectedVariant.id,
						label: selectedVariant.label,
						price: displayedPrice,
						stock: selectedVariant.stock
					}
				: undefined,
			quantity: requestedQuantity,
			price: displayedPrice
		});
	}

	const reviewFormCtx = superForm(
		untrack(() => data.form),
		{
			validators: zodClient(reviewSchema),
			id: 'reviewForm',
			resetForm: true
		}
	);
	const { form: reviewData, enhance: reviewEnhance, message: reviewMessage } = reviewFormCtx;

	$effect(() => {
		if (!$reviewMessage) return;
		if ($reviewMessage === 'Avis publié, merci !') {
			toast.success($reviewMessage);
		} else {
			toast.error($reviewMessage);
		}
	});

	const askQuestionFormCtx = superForm(
		untrack(() => data.askForm),
		{
			validators: zodClient(askQuestionSchema),
			id: 'askQuestionForm',
			resetForm: true
		}
	);
	const {
		form: askQuestionData,
		enhance: askQuestionEnhance,
		message: askQuestionMessage
	} = askQuestionFormCtx;

	$effect(() => {
		if (!$askQuestionMessage) return;
		if ($askQuestionMessage.startsWith('Question envoyée')) {
			toast.success($askQuestionMessage);
		} else {
			toast.error($askQuestionMessage);
		}
	});
</script>

<SEO
	type="product"
	title={product.name}
	description={product.description}
	image={product.images[0] ? optimizedImageUrl(product.images[0], 800) : undefined}
	price={displayedPriceTTC}
	availability={displayedStock > 0 ? 'InStock' : 'OutOfStock'}
	sku={product.sku ?? undefined}
	ratingValue={data.reviewSummary.average}
	reviewCount={data.reviewSummary.count}
/>
<StructuredData type="BreadcrumbList" data={breadcrumbData} />

<article class="mx-auto max-w-[960px] px-6 pt-24 pb-12">
	<p class="mb-6">
		<a href="/products" class="text-foreground">← Offres</a>
	</p>
	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div>
			{#if product.images[0]}
				<img
					src={optimizedImageUrl(product.images[0], 800)}
					alt={product.name}
					class="h-auto w-full object-cover"
				/>
			{/if}
		</div>
		<div>
			<h1 class="mb-2 font-normal">{product.name}</h1>
			{#if categoryNames.length}
				<p class="mb-1 text-muted-foreground">{categoryNames.join(', ')}</p>
			{/if}
			{#if product.material}
				<p class="mb-3 text-xs tracking-wide text-muted-foreground uppercase">
					{product.material.name}
				</p>
			{/if}

			<div class="mb-3 flex items-center gap-2">
				<StarRating value={data.reviewSummary.average} readonly size="size-4" />
				{#if data.reviewSummary.count > 0}
					<span class="text-sm text-muted-foreground">
						{data.reviewSummary.average.toFixed(1)} · {data.reviewSummary.count} avis
					</span>
				{:else}
					<span class="text-sm text-muted-foreground">Aucun avis pour le moment</span>
				{/if}
			</div>

			<div class="mb-4 flex items-center gap-3">
				<p class="text-2xl">{displayedPriceTTC.toFixed(2)} €</p>
				{#if hasDiscount && !selectedVariant?.price}
					<p class="text-lg text-muted-foreground line-through">
						{toTTC(product.compareAtPrice as number, data.vatRate).toFixed(2)} €
					</p>
					<Badge variant="destructive">-{discountPercent}%</Badge>
				{/if}
			</div>

			{#if product.flashSaleEndsAt && data.flashSaleEnabled}
				<div class="mb-4">
					<FlashSaleCountdown endsAt={product.flashSaleEndsAt} variant="full" />
				</div>
			{/if}

			{#if product.variants.length > 0}
				<div class="mb-4">
					<label for="variant-select" class="mb-1 block text-sm font-medium">Variante</label>
					<Select.Root
						type="single"
						value={selectedVariantId ?? undefined}
						onValueChange={(v) => (selectedVariantId = v || null)}
					>
						<Select.Trigger id="variant-select" class="w-full max-w-xs">
							<span>{selectedVariant?.label ?? 'Choisir une variante'}</span>
						</Select.Trigger>
						<Select.Content>
							{#each product.variants as variant (variant.id)}
								<Select.Item value={variant.id} disabled={variant.stock <= 0}>
									{variant.label}{variant.stock <= 0 ? ' (rupture)' : ''}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			<p class="mb-3 text-muted-foreground">Stock : {displayedStock}</p>
			<p class="mb-6 leading-normal">{product.description}</p>
			<div class="mb-4">
				<label for="quantity-input" class="mb-1 block text-sm font-medium">Quantité</label>
				<QuantityInput
					id="quantity-input"
					value={quantity}
					max={displayedStock}
					onCommit={(v) => (quantity = v)}
					class="w-24"
				/>
			</div>
			<div class="flex items-center gap-3">
				<!-- COMMERCE-PLUGIN : entrée du tunnel depuis le catalogue. -->
				<Button type="button" onclick={handleAddToCart} disabled={displayedStock <= 0}>
					Ajouter au panier
				</Button>
				{#if data.stockAlertsEnabled && product.stock <= 0}
					<Button
						type="button"
						variant="outline"
						disabled={stockAlertBusy}
						onclick={toggleStockAlert}
					>
						{stockAlertSubscribed ? 'Vous serez prévenu' : 'Me prévenir'}
					</Button>
				{/if}
				{#if data.wishlistEnabled}
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label={inWishlist ? 'Retirer de la liste d’envies' : 'Ajouter à la liste d’envies'}
						disabled={wishlistBusy}
						onclick={toggleWishlist}
					>
						<Heart class="size-4 {inWishlist ? 'fill-current text-red-500' : ''}" />
					</Button>
				{/if}
			</div>
		</div>
	</div>

	{#if data.relatedProducts.length > 0}
		<section class="mt-16 border-t pt-10">
			<h2 class="mb-6 text-xl font-medium">Vous aimerez aussi</h2>
			<div class="grid grid-cols-2 gap-6 md:grid-cols-4">
				{#each data.relatedProducts as related (related.id)}
					<a href="/products/{related.slug}" class="block">
						<Card.Root class="gap-0 overflow-hidden py-0 transition-colors hover:border-foreground">
							<div class="h-32 w-full shrink-0 overflow-hidden">
								{#if related.images[0]}
									<img
										src={optimizedImageUrl(related.images[0], 300)}
										alt={related.name}
										loading="lazy"
										class="h-full w-full object-cover"
									/>
								{:else}
									<div class="h-full w-full bg-muted" aria-hidden="true"></div>
								{/if}
							</div>
							<Card.Content class="p-3">
								<p class="line-clamp-1 text-sm font-medium">{related.name}</p>
								<p class="text-sm text-muted-foreground">
									{toTTC(related.price, data.vatRate).toFixed(2)} €
								</p>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if recentlyViewed.length > 0}
		<section class="mt-16 border-t pt-10">
			<h2 class="mb-6 text-xl font-medium">Récemment consultés</h2>
			<div class="grid grid-cols-2 gap-6 md:grid-cols-4">
				{#each recentlyViewed as viewed (viewed.id)}
					<a href="/products/{viewed.slug}" class="block">
						<Card.Root class="gap-0 overflow-hidden py-0 transition-colors hover:border-foreground">
							<div class="h-32 w-full shrink-0 overflow-hidden">
								{#if viewed.image}
									<img
										src={optimizedImageUrl(viewed.image, 300)}
										alt={viewed.name}
										loading="lazy"
										class="h-full w-full object-cover"
									/>
								{:else}
									<div class="h-full w-full bg-muted" aria-hidden="true"></div>
								{/if}
							</div>
							<Card.Content class="p-3">
								<p class="line-clamp-1 text-sm font-medium">{viewed.name}</p>
								<p class="text-sm text-muted-foreground">
									{toTTC(viewed.price, data.vatRate).toFixed(2)} €
								</p>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<section id="reviews" class="mt-16 border-t pt-10">
		<h2 class="mb-6 text-xl font-medium">Avis</h2>

		{#if data.user}
			{#if data.hasReviewed}
				<p class="text-muted-foreground mb-8 text-sm">Vous avez déjà noté ce produit — merci !</p>
			{:else}
				<form
					method="POST"
					action="?/review"
					use:reviewEnhance
					class="mb-10 max-w-md space-y-4 rounded-lg border p-4"
				>
					<Form.Field name="rating" form={reviewFormCtx}>
						<Form.Control>
							<Form.Label>Votre note</Form.Label>
							<input type="hidden" name="rating" value={$reviewData.rating} />
							<StarRating bind:value={$reviewData.rating} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>

					<Form.Field name="comment" form={reviewFormCtx}>
						<Form.Control>
							<Form.Label>Commentaire (facultatif)</Form.Label>
							<Textarea name="comment" bind:value={$reviewData.comment} rows={3} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>

					<Button type="submit">Publier l'avis</Button>
				</form>
			{/if}
		{:else}
			<p class="text-muted-foreground mb-8 text-sm">
				<a href="/auth/login" class="underline">Connectez-vous</a> pour laisser un avis.
			</p>
		{/if}

		{#if data.reviews.length === 0}
			<p class="text-muted-foreground text-sm">Soyez le premier à donner votre avis.</p>
		{:else}
			<ul class="space-y-6">
				{#each data.reviews as review (review.id)}
					<li class="border-b pb-6 last:border-0">
						<div class="mb-1 flex items-center gap-3">
							<StarRating value={review.rating} readonly size="size-3.5" />
							<span class="text-sm font-medium">{review.authorName}</span>
						</div>
						{#if review.comment}
							<p class="text-sm leading-relaxed">{review.comment}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.productQnaEnabled}
		<section class="mt-16 border-t pt-10">
			<h2 class="mb-6 text-xl font-medium">Questions & réponses</h2>

			{#if data.user}
				<form
					method="POST"
					action="?/askQuestion"
					use:askQuestionEnhance
					class="mb-10 max-w-md space-y-4 rounded-lg border p-4"
				>
					<Form.Field name="question" form={askQuestionFormCtx}>
						<Form.Control>
							<Form.Label>Votre question</Form.Label>
							<Textarea name="question" bind:value={$askQuestionData.question} rows={3} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>

					<Button type="submit">Envoyer la question</Button>
				</form>
			{:else}
				<p class="text-muted-foreground mb-8 text-sm">
					<a href="/auth/login" class="underline">Connectez-vous</a> pour poser une question.
				</p>
			{/if}

			{#if data.questions.length === 0}
				<p class="text-muted-foreground text-sm">Aucune question répondue pour ce produit.</p>
			{:else}
				<ul class="space-y-6">
					{#each data.questions as qa (qa.id)}
						<li class="border-b pb-6 last:border-0">
							<p class="text-sm font-medium">Q : {qa.question}</p>
							<p class="text-muted-foreground mt-1 text-sm">R : {qa.answer}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</article>
