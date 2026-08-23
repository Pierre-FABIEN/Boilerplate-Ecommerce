<script lang="ts">
	import BordereauPreview from '$lib/components/invoice/BordereauPreview.svelte';

	let { data } = $props();
</script>

<BordereauPreview
	bordereau={data.bordereau}
	pdfHref={data.pdfHref}
	backHref={data.backHref}
	backLabel={data.backLabel}
/>
