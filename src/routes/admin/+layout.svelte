<script lang="ts">
	// Importation des composants principaux
	import * as Sidebar from '$shadcn/sidebar/index.js';
	import { Search } from 'lucide-svelte';
	import SmoothScrollBar from '$lib/components/smoothScrollBar/SmoothScrollBar.svelte';

	let { children } = $props();

	// Données de navigation
	const data = {
		versions: ['1.0.1', '1.1.0-alpha', '2.0.0-beta1'],
		navMain: [
			{
				title: 'Dashboard',
				items: [
					{ title: 'Accueil', url: '/admin' },
					{ title: 'ventes', url: '/admin/sales' }, // COMMERCE-PLUGIN
					{ title: 'utilisateurs', url: '/admin/users' },
					{ title: 'produits', url: '/admin/products' }, // PRODUCT-PLUGIN
					{ title: 'blog', url: '/admin/blog' }, // BLOG-PLUGIN
					{ title: 'promo', url: '/admin/promo' },
					{ title: 'contacts', url: '/admin/contacts' }
				]
			}
		]
	};
</script>

<div class="w-screen h-screen">
	<Sidebar.Provider>
		<Sidebar.Root class="border-none">
			<!-- Contenu de la Sidebar -->
			<Sidebar.Content>
				{#each data.navMain as group}
					<Sidebar.Group>
						<Sidebar.GroupLabel>{group.title}</Sidebar.GroupLabel>
						<Sidebar.Menu>
							{#each group.items as item}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={item.isActive}>
										<a href={item.url}>{item.title}</a>
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.Group>
				{/each}
			</Sidebar.Content>
		</Sidebar.Root>

		<!-- Contenu principal -->
		<Sidebar.Inset class="border rounded-[12px] m-3 max-h-[95vh] min-h-[95vh]">
			<SmoothScrollBar>
				<header class="absolute flex items-center gap-2 px-4 h-16">
					<Sidebar.Trigger />
				</header>

				<div class="py-[40px]">
					{@render children?.()}
				</div>
			</SmoothScrollBar>
		</Sidebar.Inset>
	</Sidebar.Provider>
</div>
