<script lang="ts">
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Textarea } from '$shadcn/textarea';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { contactSchema } from '$lib/schema/contact/contactSchema';
	import SEO from '$lib/components/SEO.svelte';

	let { data } = $props();

	const contactForm = superForm(data.form, {
		validators: zodClient(contactSchema),
		id: 'contactForm'
	});

	const { form: contactData, enhance: contactEnhance, message: contactMessage } = contactForm;

	$effect(() => {
		if ($contactMessage === 'Message envoyé') {
			toast.success($contactMessage);
		} else if ($contactMessage) {
			toast.error($contactMessage);
		}
	});
</script>

<SEO pageKey="contact" />

<div class="relative box-border min-h-screen w-full px-8 pt-24 pb-8">
	<div class="mx-auto w-full max-w-[600px] rounded-lg border p-6 shadow-lg backdrop-blur-3xl">
		<h1 class="mb-6 text-2xl font-bold">Contact</h1>

		<form method="POST" action="?/send" use:contactEnhance class="space-y-4">
			<Form.Field name="name" form={contactForm}>
				<Form.Control>
					<Form.Label>Nom</Form.Label>
					<Input name="name" type="text" bind:value={$contactData.name} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="email" form={contactForm}>
				<Form.Control>
					<Form.Label>Email</Form.Label>
					<Input name="email" type="email" bind:value={$contactData.email} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="subject" form={contactForm}>
				<Form.Control>
					<Form.Label>Sujet</Form.Label>
					<Input name="subject" type="text" bind:value={$contactData.subject} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="message" form={contactForm}>
				<Form.Control>
					<Form.Label>Message</Form.Label>
					<Textarea name="message" bind:value={$contactData.message} rows={6} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit">Envoyer</Button>
		</form>
	</div>
</div>
