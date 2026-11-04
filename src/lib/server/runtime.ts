import { JsonStore } from './store.ts';
import { config } from './config.ts';
import { ReminderWorker, smtpConfigured, smtpSender } from './scheduler.ts';
import { pushStore, PushWorker, browserPushSender } from './push.ts';
import { preferencesStore } from './preferences.ts';

type Runtime = {
  store: JsonStore;
  worker: ReminderWorker;
  push: PushWorker;
  pushState: ReturnType<typeof pushStore>;
  config: ReturnType<typeof config>;
  preferences: Awaited<ReturnType<typeof preferencesStore>>;
};
// Vite can reload server modules during development. Keep one write queue and
// worker across those reloads, just as in the single production process.
const state = globalThis as typeof globalThis & { __nahbeiRuntime?: Promise<Runtime> };
export function runtime() {
  return (state.__nahbeiRuntime ??= (async () => {
    const settings = config();
    const preferences = await preferencesStore(settings.directory);
    const language = () => preferences.snapshot().language;
    const store = new JsonStore(settings.directory);
    await store.load();
    const pushState = pushStore(settings.directory);
    await pushState.load();
    const push = new PushWorker(pushState, store, browserPushSender(settings.origin), language);
    const worker = new ReminderWorker(
      store,
      smtpSender(settings.smtp),
      settings.origin,
      smtpConfigured(settings.smtp),
      push,
      language
    );
    process.once('sveltekit:shutdown', () => worker.stop());
    return { store, worker, push, pushState, config: settings, preferences };
  })());
}
