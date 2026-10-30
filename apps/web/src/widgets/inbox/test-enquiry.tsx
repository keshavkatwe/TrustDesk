import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { getInboxQueryKey, receiveEventMutation } from '@/api/@tanstack/react-query.gen';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Tenant } from '@/types/api';

type TestCustomer = {
  channel: Tenant['receivingChannels'][number]['channel'];
  sender: string;
};

export function TestEnquiry({
  tenant,
  onSelect,
}: {
  tenant: Tenant;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<TestCustomer>(() => ({
    channel: tenant.receivingChannels[0]?.channel ?? 'whatsapp',
    sender: `demo:${crypto.randomUUID().slice(0, 8)}`,
  }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon data-icon="inline-start" />
          Test enquiry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test enquiry</DialogTitle>
          <DialogDescription>
            Simulate a customer contacting {tenant.shortName}. A background worker will prepare the
            draft. No real customer is contacted.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <EnquiryForm
            tenant={tenant}
            customer={customer}
            onCustomerChange={setCustomer}
            onReceived={(id) => {
              onSelect(id);
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function EnquiryForm({
  tenant,
  customer,
  onCustomerChange,
  onReceived,
}: {
  tenant: Tenant;
  customer: TestCustomer;
  onCustomerChange: (customer: TestCustomer) => void;
  onReceived: (id: string) => void;
}) {
  const [identity] = useState(() => crypto.randomUUID());
  const { channel, sender } = customer;
  const [text, setText] = useState(
    tenant.id === 'qamar'
      ? 'Can I buy 2 iPhone 16 phones? We are in Dubai and will collect.'
      : 'Please quote 300 banquet chairs for 2 days in Riyadh. We will collect.',
  );
  const client = useQueryClient();
  const mutation = useMutation({
    ...receiveEventMutation(),
    retry: false,
    onSuccess: async (receipt) => {
      await client.invalidateQueries({
        queryKey: getInboxQueryKey({ path: { tenantId: tenant.id } }),
      });
      onReceived(receipt.draftId);
    },
  });
  const destination = tenant.receivingChannels.find((entry) => entry.channel === channel);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!destination) return;
        mutation.mutate({
          body: {
            event_id: `demo-${identity}`,
            message_id: `demo-${identity}`,
            channel: destination.channel,
            to: destination.address,
            from: sender,
            received_at: new Date().toISOString(),
            text,
          },
        });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="test-channel">Channel</FieldLabel>
          <Select
            value={channel}
            onValueChange={(value) =>
              onCustomerChange({ ...customer, channel: value as typeof channel })
            }
          >
            <SelectTrigger id="test-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {tenant.receivingChannels.map((entry) => (
                  <SelectItem key={entry.channel} value={entry.channel}>
                    {entry.channel === 'whatsapp'
                      ? 'WhatsApp'
                      : entry.channel === 'email'
                        ? 'Email'
                        : 'Web form'}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Receiving address: {destination?.address ?? 'Unavailable'}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="test-sender">Customer identifier</FieldLabel>
          <Input
            id="test-sender"
            value={sender}
            onChange={(event) => onCustomerChange({ ...customer, sender: event.target.value })}
            maxLength={200}
            required
          />
          <FieldDescription>
            Kept for follow-ups while you stay in this business. Change it to start a different
            conversation.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="test-message">Customer message</FieldLabel>
          <Textarea
            id="test-message"
            value={text}
            onChange={(event) => setText(event.target.value)}
            dir="auto"
            className="min-h-28"
            maxLength={12000}
            required
          />
        </Field>
      </FieldGroup>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Enquiry was not accepted</AlertTitle>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button
          type="submit"
          disabled={mutation.isPending || !destination || !sender.trim() || !text.trim()}
        >
          {mutation.isPending ? 'Saving enquiry…' : 'Submit test enquiry'}
        </Button>
      </DialogFooter>
    </form>
  );
}
