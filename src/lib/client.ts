import { t } from './i18n/browser.ts';
import { enhance } from '$app/forms';
export function enhanceForm(
  node: HTMLFormElement,
  options: {
    onsaved?: () => void;
    onerror?: (message: string) => void;
    onbusy?: (busy: boolean) => void;
    onconfirm?: (data: FormData) => boolean;
  } = {}
) {
  return enhance(node, ({ cancel, formData }) => {
    if (options.onconfirm && !options.onconfirm(formData)) {
      cancel();
      return;
    }
    options.onerror?.('');
    options.onbusy?.(true);
    return async ({ result, update }) => {
      try {
        // Keep populated settings and filter inputs; dialogs are destroyed on save.
        // Native form.reset() would otherwise clear unchanged server-provided values.
        await update({ reset: false });
        if (result.type === 'success') options.onsaved?.();
        else if (result.type === 'failure')
          options.onerror?.(String(result.data?.error || t('Bitte die Eingaben prüfen.')));
        else if (result.type === 'error')
          options.onerror?.(
            t('Die Anfrage konnte nicht verarbeitet werden. Bitte erneut versuchen.')
          );
      } finally {
        options.onbusy?.(false);
      }
    };
  });
}
