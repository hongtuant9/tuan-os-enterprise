import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createApi } from './src/api.mjs';

// Không khởi động nếu chưa có khai báo môi trường thử nghiệm tách biệt.
if (process.env.BIZVIORA_STAGING_ACK !== 'STAGING_ONLY') {
  console.error('BIZVIORA Core yêu cầu môi trường thử nghiệm độc lập.');
  process.exit(1);
}
const { createSupabaseDependencies } = await import('./src/supabase-adapter.mjs');
const api = createApi(createSupabaseDependencies());
const host = '127.0.0.1';
const port = Number(process.env.BIZVIORA_LOCAL_PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_LOCAL_PORT');

createServer(async (incoming, outgoing) => {
  try {
    const body = ['POST','PUT','PATCH'].includes(incoming.method) ? Readable.toWeb(incoming) : undefined;
    const request = new Request(`http://${host}:${port}${incoming.url}`, {
      method: incoming.method, headers: incoming.headers, body, ...(body ? { duplex: 'half' } : {})
    });
    const response = await api(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(503, { 'Content-Type': 'application/json' });
    outgoing.end('{"error":"SERVICE_UNAVAILABLE"}');
  }
}).listen(port, host, () => console.info(`BIZVIORA Core thử nghiệm: http://${host}:${port}/health`));
