<script lang="ts">
	import { addToCart } from '$lib/store/Data/cartStore';
	import Button from '$shadcn/button/button.svelte';

	let { data } = $props();
	let product = $derived(data.product);
	let categoryNames = $derived(
		product.categories.map((link) => link.category.name).filter(Boolean)
	);

	function handleAddToCart() {
		addToCart({
			id: crypto.randomUUID(),
			product: {
				id: product.id,
				name: product.name,
				price: product.price,
				images: product.images[0] ?? '',
				stock: product.stock
			},
			quantity: 1,
			price: product.price
		});
	}
</script>

<article class="mx-auto max-w-[960px] px-6 pt-24 pb-12">
	<p class="mb-6">
		<a href="/products" class="text-foreground">← Catalogue</a>
	</p>
	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div>
			{#if product.images[0]}
				<img src={product.images[0]} alt={product.name} class="h-auto w-full object-cover" />
			{/if}
		</div>
		<div>
			<h1 class="mb-2 font-normal">{product.name}</h1>
			{#if categoryNames.length}
				<p class="mb-3 text-muted-foreground">{categoryNames.join(', ')}</p>
			{/if}
			<p class="mb-4 text-2xl">{product.price.toFixed(2)} €</p>
			<p class="mb-3 text-muted-foreground">Stock : {product.stock}</p>
			<p class="mb-6 leading-normal">{product.description}</p>
			<!-- COMMERCE-PLUGIN : entrée du tunnel depuis le catalogue. -->
			<Button type="button" onclick={handleAddToCart}>Ajouter au panier</Button>
		</div>
	</div>
</article>
