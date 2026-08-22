<script lang="ts">
	let { data } = $props();

	let activeCategoryId = $derived(data.activeCategoryId);
	let products = $derived(data.products);
	let categories = $derived(data.categories);
</script>

<div class="container">
	<h1 class="page-title">Catalogue</h1>

	<nav class="category-nav" aria-label="Filtrer par catégorie">
		<a class="category-chip" class:active={!activeCategoryId} href="/products">Tous</a>
		{#each categories as category (category.id)}
			<a
				class="category-chip"
				class:active={activeCategoryId === category.id}
				href="/products?categorie={category.id}"
			>
				{category.name}
			</a>
		{/each}
	</nav>

	{#if products.length === 0}
		<p class="empty-message">Aucun produit dans cette catégorie.</p>
	{:else}
		<div class="products-grid">
			{#each products as product (product.id)}
				<a class="product-card" href="/products/{product.slug}">
					<div class="image-container">
						{#if product.images[0]}
							<img src={product.images[0]} alt={product.name} loading="lazy" />
						{:else}
							<div class="placeholder" aria-hidden="true"></div>
						{/if}
					</div>
					<div class="content">
						<h2 class="title">{product.name}</h2>
						<p class="description">{product.description}</p>
						<p class="price">{product.price.toFixed(2)} €</p>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.container {
		position: relative;
		width: 100%;
		min-height: 100vh;
		padding: 6rem 2rem 2rem;
		box-sizing: border-box;
	}

	.page-title {
		font-family: 'Open Sans Variable', sans-serif;
		font-size: 1.75rem;
		font-weight: 300;
		text-align: center;
		margin: 0 0 1.5rem;
		letter-spacing: -0.02em;
	}

	.category-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}

	.category-chip {
		border: 1px solid currentColor;
		padding: 0.4rem 0.9rem;
		text-decoration: none;
		color: inherit;
		text-transform: uppercase;
		font-size: 0.8rem;
		letter-spacing: 0.04em;

		&.active {
			background: #000;
			color: #fff;
		}
	}

	.products-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
		max-width: 1000px;
		margin: 0 auto;
	}

	.product-card {
		border: 1px solid #e0e0e0;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		min-height: 280px;
		transition: border-color 0.2s ease;

		&:hover {
			border-color: #000;
		}
	}

	.image-container {
		width: 100%;
		height: 160px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.image-container img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		background: #f5f5f5;
	}

	.content {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.title {
		font-size: 0.95rem;
		font-weight: 500;
		margin: 0 0 0.5rem;
	}

	.description {
		font-size: 0.8rem;
		color: #666;
		margin: 0 0 0.75rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
	}

	.price {
		margin: 0;
		font-size: 1rem;
	}

	.empty-message {
		text-align: center;
		color: #666;
		padding: 2rem;
	}

	@media screen and (max-width: 768px) {
		.products-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media screen and (max-width: 480px) {
		.products-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
