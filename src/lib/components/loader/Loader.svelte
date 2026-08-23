<script lang="ts">
	import { fade } from 'svelte/transition';
</script>

<div
	class="bg-background fixed inset-0 z-[100] flex items-center justify-center"
	out:fade={{ duration: 280 }}
	role="status"
	aria-live="polite"
	aria-label="Chargement de l'application"
>
	<div class="flex flex-col items-center gap-4">
		<p
			class="text-2xl font-black tracking-wide italic uppercase [font-family:'Open_Sans_Variable',sans-serif]"
		>
			MadeInDiamonds
		</p>
		<div class="bg-muted h-1 w-32 overflow-hidden rounded-full">
			<div class="bg-foreground h-full w-1/2 animate-pulse"></div>
		</div>
	</div>
</div>
