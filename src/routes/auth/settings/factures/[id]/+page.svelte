<script lang="ts">
	import InvoicePreview from '$lib/components/invoice/InvoicePreview.svelte';

	let { data } = $props();
</script>

<InvoicePreview
	invoice={data.invoice}
	pdfHref={data.pdfHref}
	backHref={data.backHref}
	backLabel={data.backLabel}
/>
