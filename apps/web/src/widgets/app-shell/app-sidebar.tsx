import {
  ActivityIcon,
  InboxIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquareCheckIcon,
} from 'lucide-react';
import { NavLink, useMatch } from 'react-router';
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { paths, routePatterns } from '@/routes/paths';
import type { Tenant } from '@/types/api';

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
  const isInbox = useMatch(routePatterns.inbox);
  const isQuality = useMatch(routePatterns.quality);
  const isActivity = useMatch(routePatterns.activity);
  const isSettings = useMatch(routePatterns.settings);
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
                <SidebarMenuButton asChild isActive={Boolean(isInbox)}>
                  <NavLink to={paths.inbox(tenant.id)} onClick={() => setOpenMobile(false)}>
                    <InboxIcon />
                    <span>Inbox</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={Boolean(isQuality)}>
                  <NavLink to={paths.quality(tenant.id)} onClick={() => setOpenMobile(false)}>
                    <ShieldCheckIcon />
                    <span>Quality &amp; Trust</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {[
                {
                  label: 'Activity',
                  icon: ActivityIcon,
                  href: paths.activity(tenant.id),
                  active: Boolean(isActivity),
                },
                {
                  label: 'Settings',
                  icon: SettingsIcon,
                  href: paths.settings(tenant.id),
                  active: Boolean(isSettings),
                },
              ].map(({ label, icon: Icon, href, active }) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton asChild isActive={active}>
                    <NavLink to={href} onClick={() => setOpenMobile(false)}>
                      <Icon />
                      <span>{label}</span>
                    </NavLink>
                  </SidebarMenuButton>
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
