<script lang="ts">
  import Navigation from '$lib/components/Navigation.svelte';
  import { goto } from '$app/navigation';
  export let data;
  
  // Extraire toutes les catégories uniques
  $: categories = ['Tous', ...new Set(data.items.map(item => item.category).filter(Boolean))];
  
  // Index de la catégorie active
  let activeCategoryIndex = 0;
  
  // Catégorie active actuelle
  $: activeCategory = categories[activeCategoryIndex];
  
  // Filtrer les items selon la catégorie active
  $: filteredItems = activeCategory === 'Tous'
    ? data.items
    : data.items.filter(item => item.category === activeCategory);
  
  // Navigation avec les flèches
  function previousCategory() {
    activeCategoryIndex = (activeCategoryIndex - 1 + categories.length) % categories.length;
  }
  
  function nextCategory() {
    activeCategoryIndex = (activeCategoryIndex + 1) % categories.length;
  }
</script>

<div class="container">
  <!-- Titre -->
  <h1 class="page-title">Catalogue</h1>
  
  <!-- Navigation par catégories -->
  <div class="category-nav">
    <button 
      class="nav-arrow" 
      on:click={previousCategory}
      aria-label="Catégorie précédente"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>
    
    <div class="category-display">
      <h2 class="category-title">{activeCategory}</h2>
      <p class="category-count">{filteredItems.length} produit{filteredItems.length > 1 ? 's' : ''}</p>
    </div>
    
    <button 
      class="nav-arrow" 
      on:click={nextCategory}
      aria-label="Catégorie suivante"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>
  </div>
  
  <Navigation />
  
  <!-- Affichage des produits en grille 3x3 -->
  {#if filteredItems.length === 0}
    <p class="empty-message">Aucun produit dans cette catégorie.</p>
  {:else}
    <div class="products-grid">
      {#each filteredItems as item}
        <article 
          class="product-card" 
          on:click={() => goto(`/produit/${item.slug || item.id}`)}
          role="button"
          tabindex="0"
        >
          <!-- Image produit -->
          <div class="image-container">
            {#if item.gallery && item.gallery.length > 0}
              <img 
                src={item.gallery[0]} 
                alt={item.title}
                loading="lazy"
              />
            {:else}
              <div class="placeholder">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                  <rect x="3" y="3" width="18" height="18" rx="1" ry="1"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
            {/if}
          </div>
          
          <!-- Contenu produit -->
          <div class="content">
            <h3 class="title">{item.title}</h3>
            
            {#if item.description}
              <p class="description">{@html item.description}</p>
            {/if}
            
            {#if item.price !== undefined && item.price !== null}
              <p class="price">{item.price.toFixed(2)} €</p>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    padding: 2rem;
    box-sizing: border-box;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .page-title {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 1.75rem;
    font-weight: 300;
    text-align: center;
    margin: 0 0 1.5rem 0;
    color: #000000;
    letter-spacing: -0.02em;
  }

  /* Navigation par catégories */
  .category-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid #e0e0e0;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }

  .nav-arrow {
    background: transparent;
    border: 1px solid #000000;
    color: #000000;
    width: 36px;
    height: 36px;
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;
    
    &:hover {
      background: #000000;
      color: #ffffff;
    }
  }

  .category-display {
    text-align: center;
    min-width: 150px;
  }

  .category-title {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 1rem;
    font-weight: 400;
    color: #000000;
    margin: 0;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .category-count {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    color: #666666;
    margin: 0.25rem 0 0 0;
  }

  /* Grille de produits 3x3 - TAILLE NORMALE */
  .products-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
    width: 100%;
    max-width: 1000px;
    margin: 0 auto;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 1rem;
  }

  /* Carte produit - TAILLE RAISONNABLE */
  .product-card {
    background: transparent;
    border: 1px solid #e0e0e0;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    height: 280px; /* Hauteur fixe raisonnable */
    
    &:hover {
      border-color: #000000;
      transform: translateY(-2px);
    }
  }

  .image-container {
    position: relative;
    width: 100%;
    height: 160px; /* Hauteur fixe pour l'image */
    overflow: hidden;
    flex-shrink: 0;
  }

  .image-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }

  .product-card:hover .image-container img {
    transform: scale(1.05);
  }

  .placeholder {
    width: 100%;
    height: 100%;
    background: #f5f5f5;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #cccccc;
  }

  .content {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    flex: 1;
    justify-content: space-between;
  }

  .title {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 0.875rem;
    font-weight: 500;
    color: #000000;
    margin: 0 0 0.5rem 0;
    line-height: 1.4;
  }

  .description {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 0.75rem;
    font-weight: 400;
    color: #666666;
    line-height: 1.4;
    margin: 0 0 0.75rem 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex: 1;
  }

  .price {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 1rem;
    font-weight: 400;
    color: #000000;
    margin: 0;
  }

  .empty-message {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 1rem;
    font-weight: 400;
    color: #666666;
    text-align: center;
    padding: 2rem;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Dark mode support */
  :global(body.dark) {
    .page-title,
    .category-title {
      color: #ffffff;
    }
    
    .nav-arrow {
      border-color: #ffffff;
      color: #ffffff;
      
      &:hover {
        background: #ffffff;
        color: #000000;
      }
    }
    
    .category-count {
      color: #aaaaaa;
    }
    
    .category-nav {
      border-bottom-color: #333333;
    }
    
    .product-card {
      border-color: #333333;
      
      &:hover {
        border-color: #ffffff;
      }
    }
    
    .title {
      color: #ffffff;
    }
    
    .description {
      color: #aaaaaa;
    }
    
    .price {
      color: #ffffff;
    }
    
    .placeholder {
      background: #1a1a1a;
    }
    
    .empty-message {
      color: #aaaaaa;
    }
  }

  /* Responsive */
  @media screen and (max-width: 1024px) {
    .products-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
      max-width: 800px;
    }
    
    .container {
      padding: 1.5rem;
    }
    
    .product-card {
      height: 260px;
    }
    
    .image-container {
      height: 150px;
    }
  }

  @media screen and (max-width: 768px) {
    .products-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
      max-width: 600px;
    }
    
    .container {
      padding: 1.25rem;
    }
    
    .page-title {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    
    .category-nav {
      gap: 0.75rem;
      padding: 0.5rem 0;
      margin-bottom: 1.5rem;
      max-width: 400px;
    }
    
    .nav-arrow {
      width: 32px;
      height: 32px;
    }
    
    .category-title {
      font-size: 0.875rem;
    }
    
    .product-card {
      height: 250px;
    }
    
    .image-container {
      height: 140px;
    }
    
    .content {
      padding: 0.875rem;
    }
    
    .title {
      font-size: 0.8125rem;
    }
    
    .description {
      font-size: 0.6875rem;
    }
    
    .price {
      font-size: 0.875rem;
    }
  }

  @media screen and (max-width: 480px) {
    .products-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
      max-width: 350px;
    }
    
    .container {
      padding: 1rem;
      height: calc(100vh - 60px);
    }
    
    .page-title {
      font-size: 1.25rem;
    }
    
    .category-nav {
      max-width: 300px;
    }
    
    .category-title {
      font-size: 0.75rem;
    }
    
    .nav-arrow {
      width: 28px;
      height: 28px;
    }
    
    .product-card {
      height: 240px;
    }
    
    .image-container {
      height: 130px;
    }
  }
</style>