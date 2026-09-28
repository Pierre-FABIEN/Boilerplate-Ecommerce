<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Textarea } from '$shadcn/textarea/index.js';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { answerQuestionSchema } from '$lib/schema/products/questionSchema.js';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const answerForm = superForm(
		untrack(() => data.answerForm),
		{
			validators: zodClient(answerQuestionSchema),
			id: 'answerQuestion',
			...RETRY_FRIENDLY_FORM
		}
	);
	const { form: answerData, enhance: answerEnhance, message: answerMessage } = answerForm;

	$effect(() => {
		if ($answerMessage === 'Réponse publiée avec succès') {
			toast.success($answerMessage);
			setTimeout(() => goto('/admin/products/questions'), 0);
		} else if ($answerMessage) {
			toast.error($answerMessage);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border rounded-lg w-[80vw] max-w-[600px] space-y-4">
		<div>
			<h1 class="text-2xl font-bold">Répondre à la question</h1>
			<p class="text-sm text-muted-foreground">
				Produit : <a href={`/products/${data.question.product.slug}`} class="underline"
					>{data.question.product.name}</a
				>
			</p>
		</div>

		<div class="rounded border bg-muted/50 p-4">
			<p class="text-sm font-medium">{data.question.question}</p>
		</div>

		<form method="POST" action="?/answerQuestion" use:answerEnhance class="space-y-4">
			<input type="hidden" name="id" value={data.question.id} />

			<Form.Field name="answer" form={answerForm}>
				<Form.Control>
					<Form.Label>Réponse (visible publiquement une fois publiée)</Form.Label>
					<Textarea name="answer" rows={5} bind:value={$answerData.answer} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit">Publier la réponse</Button>
		</form>
	</div>
</div>
