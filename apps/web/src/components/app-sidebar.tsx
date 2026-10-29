import {
  ActivityIcon,
  InboxIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquareCheckIcon,
} from 'lucide-react';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import type { Tenant } from '@/features/inbox/types';

export function AppSidebar({
  tenants,
  tenant,
  onTenantChange,
}: {
  tenants: Tenant[];
  tenant: Tenant;
  onTenantChange: (id: Tenant['id']) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <SquareCheckIcon className="size-6 text-primary" aria-hidden="true" />
          <span className="font-semibold">TrustDesk</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  aria-current="page"
                  onClick={() => setOpenMobile(false)}
                >
                  <InboxIcon />
                  <span>Inbox</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {[
                { label: 'Quality & Trust', icon: ShieldCheckIcon },
                { label: 'Activity', icon: ActivityIcon },
                { label: 'Settings', icon: SettingsIcon },
              ].map(({ label, icon: Icon }) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton disabled>
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>Later</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="business">Business</FieldLabel>
            <Select
              value={tenant.id}
              onValueChange={(id) => {
                const next = tenants.find((entry) => entry.id === id);
                if (next) {
                  onTenantChange(next.id);
                  setOpenMobile(false);
                }
              }}
            >
              <SelectTrigger id="business" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="top">
                <SelectGroup>
                  {tenants.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.shortName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {tenant.name}
              <br />
              {tenant.location} · {tenant.currency}
            </p>
          </Field>
        </FieldGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
