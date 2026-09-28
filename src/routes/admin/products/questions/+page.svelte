<script lang="ts">
	import { untrack } from 'svelte';
	import Table from '$components/Table.svelte';
	import type { TableItem } from '$components/Table.svelte';
	import { formatDate } from '$lib/utils/formatDate';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { toast } from 'svelte-sonner';
	import { deleteQuestionSchema } from '$lib/schema/products/questionSchema';
	import Trash from 'lucide-svelte/icons/trash';
	import Pencil from 'lucide-svelte/icons/pencil';
	import ExternalLink from 'lucide-svelte/icons/external-link';

	let { data } = $props();

	const deleteQuestion = superForm(
		untrack(() => data.deleteForm),
		{
			validators: zodClient(deleteQuestionSchema),
			id: 'deleteQuestion',
			...RETRY_FRIENDLY_FORM
		}
	);
	const { enhance: deleteQuestionEnhance, message: deleteQuestionMessage } = deleteQuestion;

	const questionsData = $derived.by(() =>
		(data.questions ?? []).map((q) => ({
			...q,
			statusLabel: q.answer ? 'Répondue' : 'En attente'
		}))
	);

	const questionColumns = [
		{ key: 'productName', label: 'Produit' },
		{ key: 'authorName', label: 'Auteur' },
		{
			key: 'question',
			label: 'Question',
			formatter: (value: unknown) =>
				typeof value === 'string' && value.length > 60 ? `${value.slice(0, 60)}…` : value
		},
		{ key: 'statusLabel', label: 'Statut' },
		{
			key: 'createdAt',
			label: 'Posée le',
			formatter: (value: unknown) => formatDate(String(value))
		}
	];

	const questionActions = [
		{
			type: 'link' as const,
			name: 'voir le produit',
			url: (item: TableItem) => `/products/${item.productSlug}`,
			icon: ExternalLink
		},
		{
			type: 'link' as const,
			name: 'répondre',
			url: (item: { id: string }) => `/admin/products/questions/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form' as const,
			name: 'supprimer',
			url: '?/deleteQuestion',
			enhanceAction: deleteQuestionEnhance,
			icon: Trash
		}
	];

	$effect(() => {
		if ($deleteQuestionMessage) toast.success($deleteQuestionMessage);
	});
</script>

<svelte:head>
	<title>Questions produit — Admin</title>
</svelte:head>

<div class="ccc w-[100%]">
	<Table
		name="Questions produit"
		columns={questionColumns}
		data={questionsData}
		actions={questionActions}
		server={{
			page: data.page,
			perPage: data.perPage,
			total: data.total,
			search: data.search,
			sort: data.sort,
			dir: data.dir
		}}
	/>
</div>
