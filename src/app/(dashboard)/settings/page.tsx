'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, MessageSquare, Tag, User, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { TagManager } from '@/components/settings/tag-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { VendorManager } from '@/components/settings/vendor-manager';
import { useAuth } from '@/hooks/use-auth';

const TAB_VALUES = ['profile', 'whatsapp', 'templates', 'tags', 'vendors'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, isVendor } = useAuth();

  const queryTab = searchParams.get('tab');
  // Vendors only see their profile tab
  const defaultTab: TabValue = isVendor ? 'profile' : 'profile';
  const tab: TabValue = isTabValue(queryTab) ? queryTab : defaultTab;

  const onChange = (next: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          {isVendor
            ? 'Manage your profile and password.'
            : 'Manage your profile, WhatsApp® integration, message templates, tags, and vendors.'}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        <TabsList className="bg-slate-900 border border-slate-700">
          <TabsTrigger
            value="profile"
            className="data-active:bg-slate-800 data-active:text-violet-400 text-slate-400"
          >
            <User className="size-4" />
            Profile
          </TabsTrigger>
          {!isVendor && (
            <>
              <TabsTrigger
                value="whatsapp"
                className="data-active:bg-slate-800 data-active:text-violet-400 text-slate-400"
              >
                <Settings className="size-4" />
                WhatsApp Config
              </TabsTrigger>
              <TabsTrigger
                value="templates"
                className="data-active:bg-slate-800 data-active:text-violet-400 text-slate-400"
              >
                <MessageSquare className="size-4" />
                Templates
              </TabsTrigger>
              <TabsTrigger
                value="tags"
                className="data-active:bg-slate-800 data-active:text-violet-400 text-slate-400"
              >
                <Tag className="size-4" />
                Tags
              </TabsTrigger>
            </>
          )}
          {isAdmin && (
            <TabsTrigger
              value="vendors"
              className="data-active:bg-slate-800 data-active:text-violet-400 text-slate-400"
            >
              <Users className="size-4" />
              Vendors
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="vendors">
            <VendorManager />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
