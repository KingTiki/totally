import type { Server } from 'node:http';
import { once } from 'node:events';

export default async function setup() {
  const boot = await import(new URL('../../scripts/e2e-server.mjs', import.meta.url).href);
  const server: Server = boot.server;
  if (!server.listening) await once(server, 'listening');
  return async () => {
    const closed = once(server, 'close');
    boot.shutdown();
    await closed;
  };
}
