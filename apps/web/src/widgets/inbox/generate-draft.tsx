import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircleIcon, SparklesIcon } from 'lucide-react';
import { generateDraftMutation, getInboxQueryKey } from '@/api/@tanstack/react-query.gen';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { InboxItem } from '@/types/api';

const failureMessages: Record<string, string> = {
  timeout: 'OpenAI took too long to respond. Try again or hand off this enquiry. Nothing was sent.',
  provider_connection:
    'The connection to OpenAI failed. Try again when the connection is stable. Nothing was sent.',
  rate_limited: 'OpenAI is rate limiting requests. Wait briefly, then try again. Nothing was sent.',
  provider_auth:
    'OpenAI rejected the server credentials. Check the server’s OpenAI configuration, then try again. Nothing was sent.',
  provider_unavailable:
    'OpenAI is temporarily unavailable. Try again shortly or hand off this enquiry. Nothing was sent.',
  interrupted:
    'Drafting was interrupted before it completed. Try again or hand off this enquiry. Nothing was sent.',
};

export function GenerateDraft({
  item,
  hasUnsavedEdits,
  onSelect,
}: {
  item: InboxItem;
  hasUnsavedEdits: boolean;
  onSelect: (id: string) => void;
}) {
  const client = useQueryClient();
  const queryKey = getInboxQueryKey({ path: { tenantId: item.tenantId } });
  const mutation = useMutation({
    ...generateDraftMutation(),
    retry: false,
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey });
      onSelect(result.id);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey });
    },
  });
  const running =
    item.generation?.status === 'running' &&
    Date.now() - Date.parse(item.generation.createdAt) < 90000;
  const busy = mutation.isPending || running;
  const savedFailure =
    item.generation?.status === 'failed' && item.generation.errorCode
      ? failureMessages[item.generation.errorCode]
      : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={busy || hasUnsavedEdits}
          onClick={() =>
            mutation.mutate({
              path: { tenantId: item.tenantId, id: item.id },
              body: { revision: item.revision },
            })
          }
        >
          {busy ? (
            <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          {busy
            ? 'Preparing draft…'
            : item.provenance === 'openai'
              ? 'Regenerate AI draft'
              : 'Generate AI draft'}
        </Button>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {hasUnsavedEdits
            ? 'Finish or discard your reply edits first.'
            : 'Creates a new version. Nothing is sent.'}
        </p>
      </div>
      {!busy && (mutation.isError || item.generation?.status === 'failed') && (
        <Alert variant="destructive">
          <AlertTitle>Draft generation did not complete</AlertTitle>
          <AlertDescription>
            {savedFailure ??
              mutation.error?.message ??
              'OpenAI could not complete this attempt. Try again or hand off this enquiry. Nothing was sent.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
