import { HumanEvidence } from '../packages/core/src/evaluation/model.ts';
import { createDatabase, databaseUrl, withTenant } from '../packages/db/src/index.ts';

const database = createDatabase(databaseUrl('DATABASE_URL'));
const labels: unknown[] = [],
  events: unknown[] = [];
try {
  for (const tenantId of ['qamar', 'rimal'])
    await withTenant(database, tenantId, async (tx) => {
      const savedLabels = await tx.query.evaluationLabels.findMany({
        where: (label, { eq }) => eq(label.tenantId, tenantId),
      });
      const savedEvents = await tx.query.trustEvents.findMany({
        where: (event, { eq }) => eq(event.tenantId, tenantId),
      });
      labels.push(
        ...savedLabels.map((label) => ({ ...label, createdAt: label.createdAt.toISOString() })),
      );
      events.push(
        ...savedEvents.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      );
    });
  if (!labels.length)
    throw new Error(
      'No human labels have been saved. Complete independent reviews in Quality & Trust first.',
    );
  const evidence = HumanEvidence.parse({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    labels,
    events,
  });
  await Bun.write(
    new URL('../evals/human-evidence.json', import.meta.url),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(
    `Exported ${evidence.labels.length} actual saved human labels and ${evidence.events.length} trust events. No labels were generated.`,
  );
} finally {
  await database.close();
}
