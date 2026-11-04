import { createServer } from 'node:http';

// SvelteKit 3's adapter reads origins from configured headers. Set these ourselves
// before handing off a request, so the image stays configurable at runtime and
// never trusts a client-supplied forwarded host/protocol.
const origin = new URL(process.env.ORIGIN || 'http://localhost:3000');
if (
  !['http:', 'https:'].includes(origin.protocol) ||
  origin.origin !== (process.env.ORIGIN || 'http://localhost:3000')
) {
  throw new Error('ORIGIN muss eine HTTP(S)-Adresse ohne Pfad sein.');
}
process.env.PROTOCOL_HEADER = 'x-nahbei-internal-protocol';
process.env.HOST_HEADER = 'x-nahbei-internal-host';
process.env.PORT_HEADER = '';
process.env.BODY_SIZE_LIMIT ||= '110M';
const { handler } = await import('./build/handler.js');
export const server = createServer((request, response) => {
  request.headers['x-nahbei-internal-protocol'] = origin.protocol.slice(0, -1);
  request.headers['x-nahbei-internal-host'] = origin.host;
  handler(request, response, () => {
    response.writeHead(404);
    response.end();
  });
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log(`totally! läuft auf Port ${process.env.PORT || 3000}`);
});
let shuttingDown = false;
export function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  process.emit('sveltekit:shutdown');
  server.close();
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 30000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
