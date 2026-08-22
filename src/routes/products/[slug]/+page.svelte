<script lang="ts">
	let { data } = $props();
	let product = $derived(data.product);
	let categoryNames = $derived(
		product.categories.map((link) => link.category.name).filter(Boolean)
	);
</script>

<article class="product">
	<p class="back"><a href="/products">← Catalogue</a></p>
	<div class="layout">
		<div class="gallery">
			{#if product.images[0]}
				<img src={product.images[0]} alt={product.name} />
			{/if}
		</div>
		<div class="details">
			<h1>{product.name}</h1>
			{#if categoryNames.length}
				<p class="categories">{categoryNames.join(', ')}</p>
			{/if}
			<p class="price">{product.price.toFixed(2)} €</p>
			<p class="stock">Stock : {product.stock}</p>
			<p class="description">{product.description}</p>
		</div>
	</div>
</article>

<style>
	.product {
		max-width: 960px;
		margin: 0 auto;
		padding: 6rem 1.5rem 3rem;
	}

	.back {
		margin-bottom: 1.5rem;
	}

	.back a {
		color: inherit;
	}

	.layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}

	.gallery img {
		width: 100%;
		height: auto;
		object-fit: cover;
	}

	h1 {
		margin: 0 0 0.5rem;
		font-weight: 400;
	}

	.categories,
	.stock {
		color: #666;
		margin: 0 0 0.75rem;
	}

	.price {
		font-size: 1.5rem;
		margin: 0 0 1rem;
	}

	.description {
		line-height: 1.5;
	}

	@media (max-width: 768px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
