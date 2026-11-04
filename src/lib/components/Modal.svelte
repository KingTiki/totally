<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { onMount, tick, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } =
    $props();
  let dialog: HTMLDialogElement;
  const titleId = $props.id();
  let startedOutside = false;
  let initial = '';
  function snapshot() {
    return JSON.stringify(
      Array.from(dialog.querySelectorAll('form'), (form) =>
        Array.from(new FormData(form), ([name, value]) => [
          name,
          typeof value === 'string'
            ? value
            : [value.name, value.size, value.lastModified, value.type]
        ])
      )
    );
  }
  function dismiss() {
    const changed = snapshot() !== initial || dialog.querySelector('[data-unsaved-changes="true"]');
    if (
      changed &&
      !window.confirm(
        t('Du hast ungespeicherte Änderungen. Wirklich schließen und Änderungen verwerfen?')
      )
    )
      return;
    // Close before Svelte removes the dialog so the browser restores focus.
    dialog.close();
    onclose();
  }
  function outside(event: MouseEvent) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }
  onMount(() => {
    dialog.showModal();
    initial = snapshot();
    // Child forms initialize some defaults in effects after mounting.
    void tick().then(() => {
      if (dialog.isConnected) initial = snapshot();
    });
    return () => dialog?.close();
  });
</script>

<dialog
  bind:this={dialog!}
  aria-labelledby={titleId}
  onkeydowncapture={(event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) dismiss();
  }}
  onpointerdown={(event) => {
    startedOutside = event.isPrimary && event.button === 0 && outside(event);
  }}
  onpointercancel={() => {
    startedOutside = false;
  }}
  onclick={(event) => {
    const shouldClose = startedOutside && outside(event);
    startedOutside = false;
    if (shouldClose) dismiss();
  }}
  oncancel={(event) => {
    event.preventDefault();
    dismiss();
  }}
>
  <div class="modal-heading">
    <h2 id={titleId}>{title}</h2>
    <button class="icon-button" type="button" aria-label={t('Schließen')} onclick={dismiss}
      ><Icon name="close" /></button
    >
  </div>
  {@render children()}
</dialog>
