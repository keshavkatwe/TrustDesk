import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Settings } from '@/types/api';

export function ConfigurationCards({ settings }: { settings: Settings }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
          <CardDescription>{settings.business.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            {[
              ['Location', settings.business.location],
              ['Timezone', settings.business.timezone],
              ['Currency', settings.business.currency],
              ['Languages', settings.business.languages.join(', ')],
              ['Business', settings.business.sells],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Receiving channels</CardTitle>
          <CardDescription>Configured destinations for incoming enquiries.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {settings.channels.map((channel) => (
              <li key={`${channel.channel}:${channel.address}`}>
                <Badge variant="secondary">{channel.channel}</Badge>
                <p className="mt-1 break-all text-sm">{channel.address}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Named approvers</CardTitle>
          <CardDescription>Demo identities available for this business.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {settings.approvers.map((person) => (
              <li key={person.id}>
                <p className="text-sm font-medium">{person.name}</p>
                <p className="text-xs text-muted-foreground">{person.role}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>AI and delivery</CardTitle>
          <CardDescription>Server configuration · managed outside this form.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex min-w-0 flex-col gap-3">
            {[
              ['Model', settings.ai.model],
              ['Prompt', settings.ai.promptVersion],
              ['Pricing engine', settings.ai.engineVersion],
              [
                'OpenAI connection',
                settings.ai.providerConfigured ? 'Configured' : 'Not configured',
              ],
              ['Trust', settings.ai.trust === 'autonomous' ? 'Autonomous' : 'Supervised'],
              ['Delivery', 'Local simulator'],
              ['Delivery catalogue row', settings.commercial.deliverySku],
              ['Crew catalogue row', settings.commercial.crewSku ?? 'Not used'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
