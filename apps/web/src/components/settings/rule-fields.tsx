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
import type { Settings } from '@/types/api';

export function RuleFields({ settings }: { settings: Settings }) {
  const { rules } = settings;
  return (
    <FieldGroup>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="vatPercent">VAT (%)</FieldLabel>
          <Input
            id="vatPercent"
            name="vatPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            defaultValue={rules.vatPercent}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="discountApprovalPercent">Discount approval threshold (%)</FieldLabel>
          <Input
            id="discountApprovalPercent"
            name="discountApprovalPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            defaultValue={rules.discountApprovalPercent}
          />
          <FieldDescription>
            At or above this rate, code flags the threshold. All custom deals still need approval.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="minimumOrder">
            Minimum order ({settings.business.currency})
          </FieldLabel>
          <Input
            id="minimumOrder"
            name="minimumOrder"
            inputMode="decimal"
            pattern="[0-9]{1,12}(\.[0-9]{1,2})?"
            required
            defaultValue={rules.minimumOrder}
          />
          <FieldDescription>Before VAT, after discount. Use 0 for no minimum.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="autoSend">Automatic sending</FieldLabel>
          <Select
            name="autoSend"
            defaultValue={rules.autoSend}
            disabled={settings.tenantId === 'rimal'}
          >
            <SelectTrigger id="autoSend" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="low_risk_only">Low-risk only</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {settings.tenantId === 'rimal'
              ? 'Rimal requires automatic sending to stay off.'
              : 'Low-risk sending also requires earned trust. The agent is currently supervised.'}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="serviceAreas">Service areas</FieldLabel>
        <Textarea
          id="serviceAreas"
          name="serviceAreas"
          required
          defaultValue={rules.serviceAreas.join('\n')}
          rows={3}
        />
        <FieldDescription>
          One area per line. Requests outside these areas require handoff.
        </FieldDescription>
      </Field>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="minimumRentalMonths">Minimum rental months</FieldLabel>
          <Input
            id="minimumRentalMonths"
            name="minimumRentalMonths"
            type="number"
            min="1"
            max="1200"
            step="1"
            defaultValue={rules.minimumRentalMonths ?? ''}
          />
          <FieldDescription>Leave blank for no monthly minimum.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="maximumRentalMonths">Maximum rental months</FieldLabel>
          <Input
            id="maximumRentalMonths"
            name="maximumRentalMonths"
            type="number"
            min="1"
            max="1200"
            step="1"
            defaultValue={rules.maximumRentalMonths ?? ''}
          />
          <FieldDescription>Leave blank for no monthly maximum.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="deliveryBasis">Delivery fee basis</FieldLabel>
          <Select name="deliveryBasis" defaultValue={rules.deliveryBasis}>
            <SelectTrigger id="deliveryBasis" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="order">Once per order</SelectItem>
                <SelectItem value="trip">Per confirmed trip</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>The fee comes from the published catalogue.</FieldDescription>
        </Field>
      </FieldGroup>
      {settings.commercial.crewSku && (
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          {[
            ['stageThresholdM2', 'Stage crew threshold (m²)', rules.stageThresholdM2, 10000],
            ['screenThresholdM2', 'Screen crew threshold (m²)', rules.screenThresholdM2, 10000],
            ['crewShiftsPerOrder', 'Crew shifts per order', rules.crewShiftsPerOrder, 100],
          ].map(([name, label, value, max]) => (
            <Field key={String(name)}>
              <FieldLabel htmlFor={String(name)}>{label}</FieldLabel>
              <Input
                id={String(name)}
                name={String(name)}
                type="number"
                min="1"
                max={Number(max)}
                step="1"
                required
                defaultValue={value ?? ''}
              />
            </Field>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Crew is added above the area thresholds, or for any tent. A stage deck covers{' '}
            {settings.commercial.stageDeckAreaM2} m².
          </p>
        </FieldGroup>
      )}
      <Field>
        <FieldLabel htmlFor="faq">Approved FAQ facts</FieldLabel>
        <Textarea id="faq" name="faq" rows={6} defaultValue={rules.faq.join('\n')} />
        <FieldDescription>
          One fact per line, up to 30. Keep these facts consistent with rental and delivery rules.
          Changes affect subsequent AI interpretation and controlled FAQ replies.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
