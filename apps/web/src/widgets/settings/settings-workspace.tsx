import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { getSettingsOptions, updateSettingsMutation } from '@/api/@tanstack/react-query.gen';
import { ConfigurationCards } from '@/components/settings/configuration-cards';
import { RuleFields } from '@/components/settings/rule-fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WorkspaceHeader } from '@/components/workspace-header';
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import type { Settings, Tenant } from '@/types/api';

export function SettingsWorkspace({ tenant }: { tenant: Tenant }) {
  const query = useQuery({
    ...getSettingsOptions({ path: { tenantId: tenant.id } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [saved, setSaved] = useState<boolean | null>(null);
  const content = useRef<HTMLDivElement>(null);
  return (
    <>
      <WorkspaceHeader
        title="Settings"
        description={`${tenant.shortName} · Business rules and configuration`}
      />
      <div
        ref={content}
        id="settings"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      >
        {query.isPending ? (
          <LoadingWorkspace />
        ) : query.isError ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : (
          <div className="mx-auto flex max-w-6xl flex-col gap-5">
            {saved !== null && (
              <Alert role="status">
                <AlertTitle>
                  {saved ? 'Business rules saved.' : 'No rule values changed.'}
                </AlertTitle>
                <AlertDescription>
                  {saved
                    ? 'Changes are recorded in Activity. Existing drafts need regeneration before approval when their rule context changes.'
                    : 'The current configuration was kept.'}
                </AlertDescription>
              </Alert>
            )}
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <SettingsEditor
                key={query.data.version}
                settings={query.data}
                onSaved={(changed) => {
                  setSaved(changed);
                  if (changed !== null) content.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onReload={() => void query.refetch()}
              />
              <ConfigurationCards settings={query.data} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SettingsEditor({
  settings,
  onSaved,
  onReload,
}: {
  settings: Settings;
  onSaved: (changed: boolean | null) => void;
  onReload: () => void;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    ...updateSettingsMutation(),
    onSuccess: async (result) => {
      onSaved(result.changed);
      await client.invalidateQueries();
    },
  });
  const [reset, setReset] = useState(0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business rules</CardTitle>
        <CardDescription>
          Changes apply to future calculations. Firm quotes still require named approval, and trust
          remains supervised.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          key={reset}
          onChange={() => onSaved(null)}
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const text = (key: string) => String(data.get(key) ?? '').trim();
            const optionalNumber = (key: string) => (text(key) === '' ? null : Number(text(key)));
            const lines = (key: string) =>
              text(key)
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
            mutation.mutate({
              path: { tenantId: settings.tenantId },
              body: {
                version: settings.version,
                approverId: text('approverId'),
                reason: text('reason'),
                rules: {
                  vatPercent: text('vatPercent'),
                  discountApprovalPercent: text('discountApprovalPercent'),
                  minimumOrder: text('minimumOrder'),
                  serviceAreas: lines('serviceAreas'),
                  faq: lines('faq'),
                  autoSend:
                    settings.tenantId === 'rimal'
                      ? 'off'
                      : (text('autoSend') as Settings['rules']['autoSend']),
                  minimumRentalMonths: optionalNumber('minimumRentalMonths'),
                  maximumRentalMonths: optionalNumber('maximumRentalMonths'),
                  deliveryBasis: text('deliveryBasis') as Settings['rules']['deliveryBasis'],
                  stageThresholdM2: optionalNumber('stageThresholdM2'),
                  screenThresholdM2: optionalNumber('screenThresholdM2'),
                  crewShiftsPerOrder: optionalNumber('crewShiftsPerOrder'),
                },
              },
            });
          }}
        >
          <fieldset disabled={mutation.isPending} className="flex min-w-0 flex-col gap-6">
            <RuleFields settings={settings} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-approver">Record change as</FieldLabel>
                <Select name="approverId" required>
                  <SelectTrigger id="settings-approver" className="w-full">
                    <SelectValue placeholder="Choose approver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {settings.approvers.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name} · {person.role}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Demo identity selector; production authentication is not implemented.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-reason">Reason for change</FieldLabel>
                <Textarea
                  id="settings-reason"
                  name="reason"
                  required
                  maxLength={1000}
                  rows={2}
                  placeholder="Explain why these rules are changing."
                />
              </Field>
            </FieldGroup>
            {mutation.isError && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Settings were not saved</AlertTitle>
                <AlertDescription>{mutation.error.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">
                {mutation.isPending ? 'Saving…' : 'Save business rules'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReset((value) => value + 1);
                  mutation.reset();
                }}
              >
                Discard changes
              </Button>
              {mutation.isError && (
                <Button type="button" variant="outline" onClick={onReload}>
                  Reload current settings
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
