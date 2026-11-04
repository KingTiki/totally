<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { onDestroy } from 'svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import { openPhoto, renderPhoto, cropArea, clampCrop, initialCrop } from '#lib/photo';
  let {
    name = '',
    photo = $bindable(''),
    busy = $bindable(false)
  }: { name?: string; photo?: string; busy?: boolean } = $props();
  let error = $state(''),
    editing = $state(false),
    loading = $state(false);
  let source = $state.raw<HTMLImageElement | null>(null),
    crop = $state(initialCrop());
  let unappliedFile = $state(false),
    savedCrop = $state(JSON.stringify(initialCrop()));
  const unsaved = $derived(
    loading || (editing && (unappliedFile || JSON.stringify(crop) !== savedCrop))
  );
  let release: (() => void) | undefined,
    disposed = false;
  let input: HTMLInputElement;
  const helpId = $props.id();
  const area = $derived(source ? cropArea(source.naturalWidth, source.naturalHeight, crop) : null);
  let drag: { id: number; x: number; y: number } | undefined;
  onDestroy(() => {
    disposed = true;
    release?.();
  });

  async function choose(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    busy = loading = true;
    try {
      const opened = await openPhoto(file);
      if (disposed) {
        opened.release();
        return;
      }
      release?.();
      source = opened.image;
      release = opened.release;
      crop = initialCrop();
      unappliedFile = true;
      editing = true;
    } catch (cause) {
      error = (cause as Error).message;
    } finally {
      loading = false;
      busy = editing;
      input.value = '';
    }
  }
  async function edit() {
    error = '';
    if (!source) {
      busy = loading = true;
      try {
        const image = new Image();
        image.src = photo;
        await image.decode();
        if (disposed) return;
        source = image;
        crop = initialCrop();
        savedCrop = JSON.stringify(crop);
        unappliedFile = false;
      } catch {
        error = t('Das Foto konnte nicht geöffnet werden.');
        return;
      } finally {
        busy = loading = false;
      }
    }
    busy = editing = true;
  }
  function cancel() {
    busy = editing = false;
    error = '';
    release?.();
    release = undefined;
    source = null;
  }
  function apply() {
    if (!source) return;
    try {
      photo = renderPhoto(source, crop);
      savedCrop = JSON.stringify(crop);
      unappliedFile = false;
      busy = editing = false;
      error = '';
    } catch (cause) {
      error = (cause as Error).message;
    }
  }
  function move(dx: number, dy: number, stage: HTMLElement) {
    if (!source || !area) return;
    const size = stage.getBoundingClientRect().width;
    crop = clampCrop(source.naturalWidth, source.naturalHeight, {
      ...crop,
      x: crop.x - ((dx / size) * area.size) / source.naturalWidth,
      y: crop.y - ((dy / size) * area.size) / source.naturalHeight
    });
  }
  function pointerDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    const stage = event.currentTarget as HTMLButtonElement;
    stage.focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    move(event.clientX - drag.x, event.clientY - drag.y, event.currentTarget as HTMLElement);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function pointerEnd(event: PointerEvent) {
    if (drag?.id === event.pointerId) drag = undefined;
  }
  function keyMove(event: KeyboardEvent) {
    const step = event.shiftKey ? 20 : 5;
    const offsets: Record<string, number[]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    if (offsets[event.key]) {
      event.preventDefault();
      move(offsets[event.key][0], offsets[event.key][1], event.currentTarget as HTMLElement);
    } else if (event.key === 'Home') {
      event.preventDefault();
      crop = initialCrop();
    }
  }
  function zoom(event: Event) {
    if (source)
      crop = clampCrop(source.naturalWidth, source.naturalHeight, {
        ...crop,
        zoom: Number((event.currentTarget as HTMLInputElement).value)
      });
  }
</script>

<div class="photo-field" data-unsaved-changes={unsaved}>
  <div class="photo-picker">
    <Avatar person={{ name, photo }} class="photo-preview" />
    <div class="photo-controls">
      <span class="photo-label">{t('Profilfoto')} <span class="muted">{t('· optional')}</span></span
      >
      <div class="photo-buttons">
        <button
          type="button"
          class="button secondary small-button"
          disabled={loading}
          onclick={() => input.click()}
          ><Icon name="camera" size={16} />{loading
            ? t('Foto wird vorbereitet …')
            : photo
              ? t('Foto ändern')
              : t('Foto auswählen')}</button
        >
        {#if photo && !editing}<button
            type="button"
            class="text-button"
            disabled={loading}
            onclick={edit}>{t('Ausschnitt anpassen')}</button
          >
          <button
            type="button"
            class="text-button"
            disabled={loading}
            onclick={() => {
              photo = '';
              error = '';
              release?.();
              release = undefined;
              source = null;
            }}>{t('Foto entfernen')}</button
          >{/if}
      </div>
      <p class="field-help">{t('JPG, PNG oder WebP · bis 10 MB.')}</p>
    </div>
    <input
      bind:this={input}
      class="sr-only"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      aria-label={t('Profilfoto auswählen')}
      disabled={loading}
      onchange={choose}
    />
    <input type="hidden" name="photo" value={photo} />
  </div>
  {#if editing && source && area}
    <section class="photo-cropper" aria-label={t('Foto zuschneiden')}>
      <div class="section-heading">
        <h3>{t('Bildausschnitt wählen')}</h3>
        <button type="button" class="text-button" onclick={() => (crop = initialCrop())}
          >{t('Zurücksetzen')}</button
        >
      </div>
      <button
        type="button"
        class="crop-stage"
        aria-label={t('Bildausschnitt verschieben')}
        aria-describedby={helpId}
        onpointerdown={pointerDown}
        onpointermove={pointerMove}
        onpointerup={pointerEnd}
        onpointercancel={pointerEnd}
        onlostpointercapture={pointerEnd}
        onkeydown={keyMove}
      >
        <img
          src={source.src}
          alt=""
          draggable="false"
          style:width={`${(source.naturalWidth / area.size) * 100}%`}
          style:height={`${(source.naturalHeight / area.size) * 100}%`}
          style:left={`${(-area.x / area.size) * 100}%`}
          style:top={`${(-area.y / area.size) * 100}%`}
        />
        <span class="crop-mask"></span>
      </button>
      <p class="field-help" id={helpId}>
        {t(
          'Bild mit Maus oder Finger verschieben. Mit der Tastatur: Pfeiltasten, Umschalt für größere Schritte.'
        )}
      </p>
      <label class="crop-zoom"
        >{t('Zoom')}
        <input type="range" min="1" max="3" step="0.05" value={crop.zoom} oninput={zoom} /><span
          >{Math.round(crop.zoom * 100)} %</span
        ></label
      >
      <div class="crop-actions">
        <button type="button" class="button secondary small-button" onclick={cancel}
          >{t('Abbrechen')}</button
        ><button type="button" class="button primary small-button" onclick={apply}
          >{t('Ausschnitt übernehmen')}</button
        >
      </div>
    </section>
  {/if}
  {#if error}<p class="photo-error" role="alert">{error}</p>{/if}
</div>
