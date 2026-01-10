<script lang="ts">
  import Navigation from '$lib/components/Navigation.svelte';
  import { mode } from 'mode-watcher';
  import { goto } from '$app/navigation';
  const categories = [
    { title: 'Category 1', slug: 'Category1' },
    { title: 'Category 2', slug: 'Category2' },
    { title: 'Category 3', slug: 'Category3' }
  ];

  function goToCategory(slug: string) {
    goto(`/catalogue/${slug}`);
  }
</script>

<div class="container">
  <div class="cards-grid">
    {#each categories as category}
      <article
        class="card"
        on:click={() => goToCategory(category.slug)}
        role="button"
        tabindex="0"
        on:keydown={(e) => e.key === 'Enter' && goToCategory(category.slug)}
      >
        <h2 class="card-title">{category.title}</h2>
      </article>
    {/each}
  </div>
</div>
<Navigation />
<style lang="scss">
  .container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3rem;
    max-width: 1000px;
    width: 100%;
  }

  .card {
    background: transparent;
    border: 1px solid #454444;
    border-radius: 0;
    padding: 3rem 2rem;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color:#454444;
    
    &:hover {
      background: #000000;
      .card-title {
        color: #ffffff;
      }
    }
    
    &:focus {
      outline: 2px solid #000000;
      outline-offset: 2px;
    }
  }

  .card-title {
    font-family: 'Open Sans Variable', sans-serif;
    font-size: 1.25rem;
    font-weight: 400;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #000000;
    margin: 0;
    transition: color 0.2s ease;
  }

  /* Dark mode support */
  :global(body.dark) {
    .card {
      border-color: #ffffff;
      
      &:hover {
        background: #ffffff;
        .card-title {
          color: #000000;
        }
      }
      
      &:focus {
        outline-color: #ffffff;
      }
    }
    
    .card-title {
      color: #ffffff;
    }
  }

  /* Responsive */
  @media screen and (max-width: 768px) {
    .cards-grid {
      grid-template-columns: 1fr;
      gap: 2rem;
      max-width: 400px;
    }
    
    .card {
      padding: 2.5rem 2rem;
    }
  }

  @media screen and (max-width: 480px) {
    .container {
      padding: 1.5rem;
    }
    
    .card {
      padding: 2rem 1.5rem;
    }
    
    .card-title {
      font-size: 1.125rem;
    }
  }
</style>