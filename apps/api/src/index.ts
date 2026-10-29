import { createApp } from './app.ts';

const port = Number(process.env.API_PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535.');
}

const app = createApp().listen({ port, hostname: '127.0.0.1' });

console.log(`TrustDesk API: http://localhost:${port}`);
console.log(`OpenAPI: http://localhost:${port}/openapi`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.stop();
    process.exit(0);
  });
}
