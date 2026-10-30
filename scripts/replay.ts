const port = Number(process.env.API_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local API port.');
const events = (await Bun.file(new URL('../seed/events.jsonl', import.meta.url)).text())
  .trim()
  .split('\n');
let failed = 0;
for (const line of events) {
  const event = JSON.parse(line);
  const response = await fetch(`http://127.0.0.1:${port}/local/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    failed++;
    console.log(`${event.event_id}: rejected (${response.status})`);
    continue;
  }
  const receipt = (await response.json()) as { tenantId: string; outcome: string };
  console.log(`${event.event_id}: ${receipt.tenantId} · ${receipt.outcome}`);
}
console.log(
  `Replay acknowledged ${events.length - failed}/${events.length} events. Drafting continues in the worker.`,
);
if (failed) process.exitCode = 1;
