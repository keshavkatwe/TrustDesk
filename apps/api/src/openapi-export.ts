import { createApp } from './app.ts';

const response = await createApp().handle(new Request('http://localhost/openapi/json'));

if (!response.ok) {
  throw new Error(`OpenAPI export failed with status ${response.status}.`);
}

const spec: unknown = await response.json();
await Bun.write(new URL('../openapi.json', import.meta.url), `${JSON.stringify(spec, null, 2)}\n`);
console.log('Exported apps/api/openapi.json');
