<script lang="ts">
	import SmoothScrollBarStore from '$lib/store/SmoothScrollBarStore';
	import gsap from 'gsap';
	import ScrollTrigger from 'gsap/dist/ScrollTrigger';
	import Scrollbar from 'smooth-scrollbar';

	let { children } = $props();

	let scrollX = $state(0);
	let scrollY = $state(0);
	let smoothScoller = $state.raw<HTMLElement | null>(null); // Utilisation de $state.raw
	let smoothScroll: Scrollbar | null = null; // Retrait de $state

	$effect(() => {
		gsap.registerPlugin(ScrollTrigger);

		if (!smoothScoller) {
			throw new Error('Element #smoothScoller not found');
		}

		// Initialisation de smoothScroll
		smoothScroll = Scrollbar.init(smoothScoller, {
			damping: 0.1,
			delegateTo: document,
			alwaysShowTracks: true
		});

		// Mise à jour du store sans déclencher de réactivité dans $effect
		SmoothScrollBarStore.update((state) => ({
			...state,
			smoothScroll
		}));

		const updateScroll = (status: any) => {
			scrollX = status.offset.x;
			scrollY = status.offset.y;

			SmoothScrollBarStore.update((state) => ({
				...state,
				scrollX,
				scrollY
			}));
		};

		smoothScroll.addListener(updateScroll);

		ScrollTrigger.scrollerProxy(smoothScoller, {
			scrollTop(value) {
				if (arguments.length && smoothScroll) {
					smoothScroll.scrollTop = value ?? 0;
				}
				return smoothScroll ? smoothScroll.scrollTop : 0;
			}
		});

		smoothScroll.addListener(ScrollTrigger.update);

		ScrollTrigger.defaults({
			scroller: smoothScoller,
			pinType: 'transform'
		});

		// Fonction de nettoyage pour remplacer onDestroy
		return () => {
			if (smoothScroll) {
				smoothScroll.removeListener(ScrollTrigger.update);
				smoothScroll.removeListener(updateScroll);
				smoothScroll.destroy();
			}
		};
	});
</script>

<div bind:this={smoothScoller} class="relative h-screen overflow-hidden" id="smoothScoller">
	{@render children()}
</div>
