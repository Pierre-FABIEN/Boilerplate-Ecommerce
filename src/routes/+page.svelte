<script lang="ts">
	import '@fontsource-variable/open-sans';
	import '@fontsource-variable/raleway';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { mode } from 'mode-watcher';
	import { Power } from 'lucide-svelte';
	import { isSmall } from '$lib/store/mediaStore';
	import { page } from '$app/stores';
	import SEO from '$lib/components/SEO.svelte';

	let animateLines = $state(false); // Contrôle de l'animation des lignes

	function handleClick() {
		goto('/atelier');
	}

	let strokeColor = $derived(mode.current === 'light' ? '#00021a' : '#00c2ff');

	const onHoverButton = () => {
		animateLines = !animateLines;
	};

	$effect(() => {
		// Les deux lectures ci-dessous sont les dépendances ;
		// le $effect se relancera si l'une change.
		const path = $page.url.pathname;
		const small = $isSmall;
	});
</script>

<!-- SEO pour la page d'accueil -->
<SEO pageKey="home" />

<div
	class="ccc absolute z-30 top-[5vh] left-1/2 w-[300px] -translate-x-1/2 min-[426px]:w-[400px] min-[601px]:w-[500px] min-[1001px]:top-[25vh] min-[1001px]:left-[10vw] min-[1001px]:translate-x-0"
>
	<h1
		class="h-[100px] w-[300px] text-left font-black italic uppercase text-transparent min-[426px]:h-[200px] min-[426px]:w-[400px] min-[426px]:[-webkit-text-stroke-width:2px] min-[601px]:w-[500px] [font-family:'Open_Sans_Variable',sans-serif] [-webkit-text-stroke-width:1px]"
		style:--stroke-color={strokeColor}
		style="-webkit-text-stroke-color: {strokeColor};"
	>
		<span
			class={[
				'absolute w-[300px] text-[30px] transition-transform duration-[400ms] ease-in-out min-[426px]:w-[400px] min-[426px]:text-[40px] min-[601px]:w-[500px] min-[601px]:text-[60px]',
				animateLines && 'translate-x-10'
			]}
			transition:fly={{ x: -88, duration: 100 }}
		>
			Customise ta
		</span>

		<span
			class={[
				'absolute top-[25px] left-[50px] w-[250px] text-[40px] transition-transform duration-[400ms] ease-in-out min-[426px]:top-[53px] min-[426px]:left-[100px] min-[426px]:w-[400px] min-[426px]:text-[50px] min-[601px]:w-[500px] min-[601px]:text-[75px]',
				animateLines && 'translate-x-[50px]'
			]}
			transition:fly={{ x: -88, duration: 100 }}
		>
			canette et
		</span>

		<span
			class={[
				'absolute top-[65px] w-[300px] text-[30px] transition-transform duration-[400ms] ease-in-out min-[426px]:top-[130px] min-[426px]:w-[400px] min-[426px]:text-[40px] min-[601px]:w-[500px] min-[601px]:text-[56px]',
				animateLines && 'translate-x-5'
			]}
			transition:fly={{ x: -88, duration: 200 }}
		>
			commande la
		</span>
	</h1>
	<button
		class="ccc group mt-[5vh] translate-x-[33px] rounded-2xl"
		transition:fly={{ x: -88, duration: 500 }}
		onclick={handleClick}
		onmouseenter={onHoverButton}
		onmouseleave={onHoverButton}
	>
		<a
			class="rcc relative overflow-hidden text-left text-[22px] uppercase [font-family:'Open_Sans_Variable',sans-serif] before:absolute before:top-0 before:left-0 before:-z-10 before:h-0.5 before:w-2.5 before:bg-[var(--stroke-color)] before:transition-all before:duration-[400ms] hover:before:w-[200px]"
			style="color: {strokeColor}; --stroke-color: {strokeColor};"
			href="/atelier"
		>
			Commencer
			<span class="translate-y-[35px] transition-all duration-[400ms] ease-in-out group-hover:translate-y-0">
				<Power class="ml-10" />
			</span>
		</a>
	</button>
	<a
		class="mt-[15px] text-sm tracking-normal transition-all duration-200 [font-family:'Open_Sans_Variable',sans-serif] hover:tracking-[1px]"
		href="/catalogue"
		transition:fly={{ x: -88, duration: 600 }}
	>
		Notre catalogue
	</a>
</div>
