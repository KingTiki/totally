<script lang="ts">
  let { form }: { form?: { error?: string; success?: string } | null } = $props();
</script>

{#if form?.error}<p class="notice error" role="alert">{form.error}</p>
{:else if form?.success}<p class="notice success" role="status">{form.success}</p>{/if}
