<script lang="ts">
	import * as Card from '$shadcn/card/index.js';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { Tag, X } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		productTotalTTC: number;
		appliedCode: string;
		discountAmount: number;
		onApplied: (code: string, discount: number) => void;
		onRemoved: () => void;
	}

	let { productTotalTTC, appliedCode, discountAmount, onApplied, onRemoved }: Props = $props();

	let codeInput = $state('');
	let loading = $state(false);

	async function applyCode() {
		const code = codeInput.trim();
		if (!code) {
			toast.error('Veuillez saisir un code promo.');
			return;
		}

		try {
			loading = true;
			const res = await fetch('/api/promo/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, productTotalTTC })
			});
			const result = await res.json();

			if (result.valid) {
				onApplied(result.code ?? code.toUpperCase(), result.discountAmount);
				toast.success(`Code promo appliqué : -${result.discountAmount.toFixed(2)}€`);
				codeInput = '';
			} else {
				toast.error(result.reason || 'Code promo invalide.');
			}
		} catch (err) {
			console.error('Erreur validation code promo:', err);
			toast.error("Impossible de vérifier le code promo.");
		} finally {
			loading = false;
		}
	}

	function removeCode() {
		onRemoved();
		toast.success('Code promo retiré.');
	}
</script>

<Card.Root>
	<div class="p-6 flex flex-col space-y-1.5">
		<h3 class="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
			<Tag class="w-5 h-5" />
			Code promo
		</h3>
	</div>
	<div class="p-6 pt-0">
		{#if appliedCode && discountAmount > 0}
			<div class="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
				<div>
					<p class="font-medium">{appliedCode}</p>
					<p class="text-sm text-muted-foreground">Remise de {discountAmount.toFixed(2)}€</p>
				</div>
				<button
					type="button"
					onclick={removeCode}
					class="text-destructive hover:text-destructive/80"
					aria-label="Retirer le code promo"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		{:else}
			<div class="flex gap-2">
				<Input
					type="text"
					placeholder="Entrez votre code"
					bind:value={codeInput}
					onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), applyCode())}
				/>
				<Button type="button" onclick={applyCode} disabled={loading}>
					{loading ? '...' : 'Appliquer'}
				</Button>
			</div>
		{/if}
	</div>
</Card.Root>
