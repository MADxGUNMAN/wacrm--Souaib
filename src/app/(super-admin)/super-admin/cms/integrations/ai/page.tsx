'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  ExternalLink,
  Loader2,
  Sparkles,
  HelpCircle,
  Layers,
  Search,
  Info,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AddButton,
  EditorCard as Card,
  Field,
  IconSelect as KitIconSelect,
  RemoveButton,
  ResetButton,
  StringList,
  TextField,
  clone,
} from '@/components/super-admin/cms-editor-kit';
import type {
  IntegrationPage,
  IntegrationFeature,
  IntegrationFAQ,
} from '@/types/super-admin';
import {
  AI_PAGE_DEFAULTS,
  AI_PAGE_DEFAULT_CONTENT,
  AI_PAGE_DEFAULT_FAQS,
  AI_PAGE_DEFAULT_FEATURES,
  AI_PAGE_ICONS,
  AI_PAGE_SLUG,
  resolveAiContent,
  type AiConnectCard,
  type AiDataCard,
  type AiMockMessage,
  type AiPageContent,
} from '@/lib/cms/ai-integration-content';

const API_URL = `/api/super-admin/cms/integration-pages/${AI_PAGE_SLUG}`;
const PUBLIC_URL = '/integrations/ai';

/** Empty fields on load are filled from the defaults, so the editor shows
 *  exactly what the public page renders. CTA links stay as stored: an
 *  empty link is how a button is hidden. */
function withDefaults(p: IntegrationPage): IntegrationPage {
  const d = AI_PAGE_DEFAULTS;
  return {
    ...p,
    title: p.title || d.title,
    subtitle: p.subtitle || d.subtitle,
    badge_text: p.badge_text || d.badge_text,
    primary_cta_text: p.primary_cta_text || d.primary_cta_text,
    secondary_cta_text: p.secondary_cta_text || d.secondary_cta_text,
    prerequisites: p.prerequisites?.length
      ? p.prerequisites
      : [...d.highlights],
    features: p.features?.length ? p.features : clone(AI_PAGE_DEFAULT_FEATURES),
    faqs: p.faqs?.length ? p.faqs : clone(AI_PAGE_DEFAULT_FAQS),
    seo_meta_title: p.seo_meta_title || d.seo_meta_title,
    seo_meta_description: p.seo_meta_description || d.seo_meta_description,
  };
}

function IconSelect(props: { value: string; onChange: (v: string) => void }) {
  return <KitIconSelect {...props} options={AI_PAGE_ICONS} />;
}

const MOCK_ROLE_LABELS: Record<AiMockMessage['role'], string> = {
  user: 'User prompt',
  assistant: 'AI reply',
  tool: 'Tool call',
};

// ── Page ───────────────────────────────────────────────────────

export default function AiConnectorCMSEditorPage() {
  const [page, setPage] = useState<IntegrationPage | null>(null);
  const [content, setContent] = useState<AiPageContent>(() =>
    clone(AI_PAGE_DEFAULT_CONTENT)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('hero');

  useEffect(() => {
    async function fetchPage() {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('Failed to load the AI connector page');
        const data = await res.json();
        const loaded = data.page as IntegrationPage;
        setPage(withDefaults(loaded));
        setContent(resolveAiContent(loaded.content));
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPage();
  }, []);

  const handleSave = async () => {
    if (!page) return;
    setIsSaving(true);
    try {
      const res = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: page.title,
          subtitle: page.subtitle,
          badge_text: page.badge_text,
          primary_cta_text: page.primary_cta_text,
          primary_cta_url: page.primary_cta_url.trim(),
          secondary_cta_text: page.secondary_cta_text,
          secondary_cta_url: page.secondary_cta_url.trim(),
          prerequisites: page.prerequisites,
          features: page.features,
          faqs: page.faqs,
          seo_meta_title: page.seo_meta_title,
          seo_meta_description: page.seo_meta_description,
          is_published: page.is_published,
          content,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save changes');
      }
      toast.success('AI connector page saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = <K extends keyof IntegrationPage>(
    field: K,
    value: IntegrationPage[K]
  ) => {
    setPage((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const setC = <K extends keyof AiPageContent>(
    key: K,
    value: AiPageContent[K]
  ) => setContent((prev) => ({ ...prev, [key]: value }));

  const resetC = (...keys: (keyof AiPageContent)[]) =>
    setContent((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        (next as Record<string, unknown>)[k] = clone(
          AI_PAGE_DEFAULT_CONTENT[k]
        );
      }
      return next;
    });

  // Permission levels (features column)
  const updateLevel = (
    idx: number,
    field: keyof IntegrationFeature,
    val: string
  ) => {
    if (!page) return;
    updateField(
      'features',
      page.features.map((f, i) => (i === idx ? { ...f, [field]: val } : f))
    );
  };

  // FAQs
  const updateFaq = (idx: number, field: keyof IntegrationFAQ, val: string) => {
    if (!page) return;
    updateField(
      'faqs',
      page.faqs.map((f, i) => (i === idx ? { ...f, [field]: val } : f))
    );
  };

  // Connect cards
  const updateConnectCard = (idx: number, patch: Partial<AiConnectCard>) =>
    setC(
      'connect_cards',
      content.connect_cards.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );

  // Hero chat mockup
  const updateMockMessage = (idx: number, patch: Partial<AiMockMessage>) =>
    setC(
      'mockup_messages',
      content.mockup_messages.map((m, i) =>
        i === idx ? { ...m, ...patch } : m
      )
    );

  // Data cards
  const updateDataCard = (idx: number, patch: Partial<AiDataCard>) =>
    setC(
      'data_cards',
      content.data_cards.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="p-8 text-center text-slate-500">
        Could not load the AI connector page settings.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href="/super-admin/cms"
            aria-label="Back to CMS"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Link
                href="/super-admin/cms"
                className="transition-colors hover:text-slate-600"
              >
                CMS
              </Link>
              <span>/</span>
              <span>Integrations</span>
              <span>/</span>
              <span className="font-medium text-slate-700">
                Claude &amp; ChatGPT
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Connector Page CMS
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={PUBLIC_URL}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-emerald-600"
          >
            <span>Live Preview</span>
            <ExternalLink className="h-4 w-4" />
          </Link>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="border border-slate-200 bg-slate-100/80 p-1">
          <TabsTrigger value="hero" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Hero & Buttons
          </TabsTrigger>
          <TabsTrigger value="sections" className="gap-2">
            <Layers className="h-4 w-4" />
            Page Sections
          </TabsTrigger>
          <TabsTrigger value="labels" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Mockup & Labels
          </TabsTrigger>
          <TabsTrigger value="faqs" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            FAQs
          </TabsTrigger>
          <TabsTrigger value="seo" className="gap-2">
            <Search className="h-4 w-4" />
            SEO & Status
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: HERO & BUTTONS */}
        <TabsContent value="hero" className="space-y-6">
          <Card
            title="Hero"
            icon={<Sparkles className="h-5 w-5 text-emerald-500" />}
            actions={
              <ResetButton
                onClick={() =>
                  setPage((prev) =>
                    prev
                      ? {
                          ...prev,
                          badge_text: AI_PAGE_DEFAULTS.badge_text,
                          title: AI_PAGE_DEFAULTS.title,
                          subtitle: AI_PAGE_DEFAULTS.subtitle,
                        }
                      : prev
                  )
                }
              />
            }
          >
            <div className="grid grid-cols-1 gap-4">
              <Field label="Badge Text">
                <Input
                  value={page.badge_text}
                  onChange={(e) => updateField('badge_text', e.target.value)}
                  placeholder={AI_PAGE_DEFAULTS.badge_text}
                />
              </Field>
              <Field label="Main Headline (Title)">
                <Input
                  value={page.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder={AI_PAGE_DEFAULTS.title}
                />
              </Field>
              <Field label="Subtitle / Description">
                <Textarea
                  rows={3}
                  value={page.subtitle}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Directory Buttons"
            description="A button appears only when both its text and link are set. Add the Claude directory and ChatGPT plugin links once the listings are live."
            icon={<ExternalLink className="h-5 w-5 text-emerald-500" />}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Primary Button Text">
                <Input
                  value={page.primary_cta_text}
                  onChange={(e) =>
                    updateField('primary_cta_text', e.target.value)
                  }
                  placeholder={AI_PAGE_DEFAULTS.primary_cta_text}
                />
              </Field>
              <Field
                label="Primary Button Link"
                hint={
                  page.primary_cta_url.trim()
                    ? undefined
                    : 'Hidden: no link set.'
                }
              >
                <Input
                  value={page.primary_cta_url}
                  onChange={(e) =>
                    updateField('primary_cta_url', e.target.value)
                  }
                  placeholder="https://claude.ai/directory/..."
                />
              </Field>
              <Field label="Secondary Button Text">
                <Input
                  value={page.secondary_cta_text}
                  onChange={(e) =>
                    updateField('secondary_cta_text', e.target.value)
                  }
                  placeholder={AI_PAGE_DEFAULTS.secondary_cta_text}
                />
              </Field>
              <Field
                label="Secondary Button Link"
                hint={
                  page.secondary_cta_url.trim()
                    ? undefined
                    : 'Hidden: no link set.'
                }
              >
                <Input
                  value={page.secondary_cta_url}
                  onChange={(e) =>
                    updateField('secondary_cta_url', e.target.value)
                  }
                  placeholder="https://chatgpt.com/apps/..."
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Hero Highlights"
            description="Short ticks shown under the subtitle."
            actions={
              <>
                <ResetButton
                  onClick={() =>
                    updateField('prerequisites', [
                      ...AI_PAGE_DEFAULTS.highlights,
                    ])
                  }
                />
                <AddButton
                  label="Add Highlight"
                  onClick={() =>
                    updateField('prerequisites', [
                      ...page.prerequisites,
                      'New highlight',
                    ])
                  }
                />
              </>
            }
          >
            <StringList
              items={page.prerequisites}
              onChange={(items) => updateField('prerequisites', items)}
              itemLabel="Highlight"
            />
          </Card>
        </TabsContent>

        {/* TAB 2: PAGE SECTIONS */}
        <TabsContent value="sections" className="space-y-6">
          <Card
            title="What You Can Ask"
            description="Example prompts shown as cards."
            actions={
              <>
                <ResetButton
                  onClick={() =>
                    resetC('examples_heading', 'examples_subtitle', 'examples')
                  }
                />
                <AddButton
                  label="Add Example"
                  onClick={() =>
                    setC('examples', [...content.examples, 'New example'])
                  }
                />
              </>
            }
          >
            <div className="mb-4 grid grid-cols-1 gap-4">
              <Field label="Heading">
                <Input
                  value={content.examples_heading}
                  onChange={(e) => setC('examples_heading', e.target.value)}
                />
              </Field>
              <Field label="Subtitle">
                <Textarea
                  rows={2}
                  value={content.examples_subtitle}
                  onChange={(e) => setC('examples_subtitle', e.target.value)}
                />
              </Field>
            </div>
            <StringList
              items={content.examples}
              onChange={(items) => setC('examples', items)}
              itemLabel="Example"
            />
          </Card>

          <Card
            title="How to Connect"
            description="One card per AI app. Write one step per line."
            actions={
              <>
                <ResetButton
                  onClick={() =>
                    resetC(
                      'connect_heading',
                      'connect_subtitle',
                      'connect_cards',
                      'server_url_label',
                      'server_url_note'
                    )
                  }
                />
                <AddButton
                  label="Add Card"
                  onClick={() =>
                    setC('connect_cards', [
                      ...content.connect_cards,
                      { title: 'New app', steps: ['First step'] },
                    ])
                  }
                />
              </>
            }
          >
            <div className="mb-4 grid grid-cols-1 gap-4">
              <Field label="Heading">
                <Input
                  value={content.connect_heading}
                  onChange={(e) => setC('connect_heading', e.target.value)}
                />
              </Field>
              <Field label="Subtitle">
                <Textarea
                  rows={2}
                  value={content.connect_subtitle}
                  onChange={(e) => setC('connect_subtitle', e.target.value)}
                />
              </Field>
            </div>
            <div className="space-y-4">
              {content.connect_cards.map((card, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={card.title}
                      onChange={(e) =>
                        updateConnectCard(idx, { title: e.target.value })
                      }
                      aria-label={`Card ${idx + 1} title`}
                      placeholder="App name"
                      className="bg-white font-medium"
                    />
                    <RemoveButton
                      label={`Remove card ${idx + 1}`}
                      onClick={() =>
                        setC(
                          'connect_cards',
                          content.connect_cards.filter((_, i) => i !== idx)
                        )
                      }
                    />
                  </div>
                  <Textarea
                    rows={4}
                    value={card.steps.join('\n')}
                    onChange={(e) =>
                      updateConnectCard(idx, {
                        steps: e.target.value.split('\n'),
                      })
                    }
                    aria-label={`Card ${idx + 1} steps, one per line`}
                    placeholder="One step per line"
                    className="bg-white"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Server URL Label">
                <Input
                  value={content.server_url_label}
                  onChange={(e) => setC('server_url_label', e.target.value)}
                />
              </Field>
              <Field label="Server URL Note">
                <Input
                  value={content.server_url_note}
                  onChange={(e) => setC('server_url_note', e.target.value)}
                />
              </Field>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The server URL itself comes from the connector configuration
              (AI_CONNECTOR_ISSUER) and can&apos;t be edited here.
            </p>
          </Card>

          <Card
            title="What It May Do (Permission Levels)"
            description="One card per permission level. Keep these in line with the scopes users see on the consent screen."
            actions={
              <>
                <ResetButton
                  onClick={() => {
                    updateField('features', clone(AI_PAGE_DEFAULT_FEATURES));
                    resetC('permissions_heading', 'permissions_subtitle');
                  }}
                />
                <AddButton
                  label="Add Level"
                  onClick={() =>
                    updateField('features', [
                      ...page.features,
                      {
                        title: 'New level',
                        description: 'What this level allows.',
                        icon: 'ShieldCheck',
                      },
                    ])
                  }
                />
              </>
            }
          >
            <div className="mb-4 grid grid-cols-1 gap-4">
              <Field label="Heading">
                <Input
                  value={content.permissions_heading}
                  onChange={(e) => setC('permissions_heading', e.target.value)}
                />
              </Field>
              <Field label="Subtitle">
                <Textarea
                  rows={2}
                  value={content.permissions_subtitle}
                  onChange={(e) => setC('permissions_subtitle', e.target.value)}
                />
              </Field>
            </div>
            <div className="space-y-4">
              {page.features.map((level, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center gap-2">
                    <IconSelect
                      value={level.icon ?? ''}
                      onChange={(v) => updateLevel(idx, 'icon', v)}
                    />
                    <Input
                      value={level.title}
                      onChange={(e) =>
                        updateLevel(idx, 'title', e.target.value)
                      }
                      aria-label={`Level ${idx + 1} title`}
                      className="bg-white font-medium"
                    />
                    <RemoveButton
                      label={`Remove level ${idx + 1}`}
                      onClick={() =>
                        updateField(
                          'features',
                          page.features.filter((_, i) => i !== idx)
                        )
                      }
                    />
                  </div>
                  <Textarea
                    rows={2}
                    value={level.description}
                    onChange={(e) =>
                      updateLevel(idx, 'description', e.target.value)
                    }
                    aria-label={`Level ${idx + 1} description`}
                    className="bg-white"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Safeguards"
            actions={
              <>
                <ResetButton
                  onClick={() => resetC('safeguards_heading', 'safeguards')}
                />
                <AddButton
                  label="Add Safeguard"
                  onClick={() =>
                    setC('safeguards', [...content.safeguards, 'New safeguard'])
                  }
                />
              </>
            }
          >
            <Field label="Heading" className="mb-4">
              <Input
                value={content.safeguards_heading}
                onChange={(e) => setC('safeguards_heading', e.target.value)}
              />
            </Field>
            <StringList
              items={content.safeguards}
              onChange={(items) => setC('safeguards', items)}
              itemLabel="Safeguard"
              multiline
            />
          </Card>

          <Card
            title="Your Data"
            description="Links to the privacy policy and terms are added below these cards automatically."
            actions={
              <>
                <ResetButton
                  onClick={() => resetC('data_heading', 'data_cards')}
                />
                <AddButton
                  label="Add Card"
                  onClick={() =>
                    setC('data_cards', [
                      ...content.data_cards,
                      { title: 'New card', body: 'Card text.', icon: 'Lock' },
                    ])
                  }
                />
              </>
            }
          >
            <Field label="Heading" className="mb-4">
              <Input
                value={content.data_heading}
                onChange={(e) => setC('data_heading', e.target.value)}
              />
            </Field>
            <div className="space-y-4">
              {content.data_cards.map((card, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center gap-2">
                    <IconSelect
                      value={card.icon}
                      onChange={(v) => updateDataCard(idx, { icon: v })}
                    />
                    <Input
                      value={card.title}
                      onChange={(e) =>
                        updateDataCard(idx, { title: e.target.value })
                      }
                      aria-label={`Data card ${idx + 1} title`}
                      className="bg-white font-medium"
                    />
                    <RemoveButton
                      label={`Remove data card ${idx + 1}`}
                      onClick={() =>
                        setC(
                          'data_cards',
                          content.data_cards.filter((_, i) => i !== idx)
                        )
                      }
                    />
                  </div>
                  <Textarea
                    rows={2}
                    value={card.body}
                    onChange={(e) =>
                      updateDataCard(idx, { body: e.target.value })
                    }
                    aria-label={`Data card ${idx + 1} text`}
                    className="bg-white"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Support Block & Footer"
            actions={
              <ResetButton
                onClick={() =>
                  resetC(
                    'support_heading',
                    'support_body',
                    'support_cta_text',
                    'support_cta_url',
                    'manage_cta_text',
                    'manage_cta_url',
                    'trademark_note'
                  )
                }
              />
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Heading" className="md:col-span-2">
                <Input
                  value={content.support_heading}
                  onChange={(e) => setC('support_heading', e.target.value)}
                />
              </Field>
              <Field label="Text" className="md:col-span-2">
                <Textarea
                  rows={2}
                  value={content.support_body}
                  onChange={(e) => setC('support_body', e.target.value)}
                />
              </Field>
              <Field label="Support Button Text">
                <Input
                  value={content.support_cta_text}
                  onChange={(e) => setC('support_cta_text', e.target.value)}
                />
              </Field>
              <Field label="Support Button Link">
                <Input
                  value={content.support_cta_url}
                  onChange={(e) => setC('support_cta_url', e.target.value)}
                  placeholder="/contact"
                />
              </Field>
              <Field label="Manage Button Text">
                <Input
                  value={content.manage_cta_text}
                  onChange={(e) => setC('manage_cta_text', e.target.value)}
                />
              </Field>
              <Field label="Manage Button Link">
                <Input
                  value={content.manage_cta_url}
                  onChange={(e) => setC('manage_cta_url', e.target.value)}
                  placeholder="/settings?tab=ai-connectors"
                />
              </Field>
              <Field label="Trademark Note" className="md:col-span-2">
                <Textarea
                  rows={2}
                  value={content.trademark_note}
                  onChange={(e) => setC('trademark_note', e.target.value)}
                />
              </Field>
            </div>
          </Card>
        </TabsContent>

        {/* TAB: MOCKUP & LABELS */}
        <TabsContent value="labels" className="space-y-6">
          <Card
            title="Hero Chat Mockup"
            icon={<MessageSquare className="h-5 w-5 text-emerald-500" />}
            description="The simulated Claude / ChatGPT conversation under the hero. Wrap words in **double asterisks** to make them bold."
            actions={
              <>
                <ResetButton
                  onClick={() =>
                    resetC(
                      'mockup_window_title',
                      'mockup_status_badge',
                      'mockup_user_label',
                      'mockup_messages'
                    )
                  }
                />
                <AddButton
                  label="Add Message"
                  onClick={() =>
                    setC('mockup_messages', [
                      ...content.mockup_messages,
                      {
                        role: 'user',
                        label: '',
                        badge: '',
                        body: 'New message',
                        items: [],
                      },
                    ])
                  }
                />
              </>
            }
          >
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <TextField
                label="Window Title"
                value={content.mockup_window_title}
                onChange={(v) => setC('mockup_window_title', v)}
              />
              <TextField
                label="Status Badge"
                value={content.mockup_status_badge}
                onChange={(v) => setC('mockup_status_badge', v)}
              />
              <TextField
                label="User Avatar Label"
                value={content.mockup_user_label}
                onChange={(v) => setC('mockup_user_label', v)}
              />
            </div>
            <div className="space-y-4">
              {content.mockup_messages.map((m, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) =>
                        updateMockMessage(idx, {
                          role: e.target.value as AiMockMessage['role'],
                        })
                      }
                      aria-label={`Message ${idx + 1} type`}
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-xs"
                    >
                      {(
                        Object.keys(MOCK_ROLE_LABELS) as AiMockMessage['role'][]
                      ).map((role) => (
                        <option key={role} value={role}>
                          {MOCK_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    {m.role !== 'user' ? (
                      <Input
                        value={m.label}
                        onChange={(e) =>
                          updateMockMessage(idx, { label: e.target.value })
                        }
                        aria-label={`Message ${idx + 1} label`}
                        placeholder={
                          m.role === 'tool'
                            ? 'Tool Call: messages:send'
                            : 'Status line (optional)'
                        }
                        className="bg-white"
                      />
                    ) : (
                      <span className="flex-1" />
                    )}
                    {m.role === 'tool' ? (
                      <Input
                        value={m.badge}
                        onChange={(e) =>
                          updateMockMessage(idx, { badge: e.target.value })
                        }
                        aria-label={`Message ${idx + 1} badge`}
                        placeholder="Dispatched"
                        className="w-36 bg-white"
                      />
                    ) : null}
                    <RemoveButton
                      label={`Remove message ${idx + 1}`}
                      onClick={() =>
                        setC(
                          'mockup_messages',
                          content.mockup_messages.filter((_, i) => i !== idx)
                        )
                      }
                    />
                  </div>
                  <Textarea
                    rows={2}
                    value={m.body}
                    onChange={(e) =>
                      updateMockMessage(idx, { body: e.target.value })
                    }
                    aria-label={`Message ${idx + 1} text`}
                    className="bg-white"
                  />
                  {m.role === 'assistant' ? (
                    <Field label="Bullet lines (one per line)">
                      <Textarea
                        rows={3}
                        value={m.items.join('\n')}
                        onChange={(e) =>
                          updateMockMessage(idx, {
                            items: e.target.value.split('\n'),
                          })
                        }
                        className="bg-white"
                      />
                    </Field>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Section Labels"
            description="Breadcrumb, the small uppercase eyebrows above each section and other short labels."
            actions={
              <ResetButton
                onClick={() =>
                  resetC(
                    'breadcrumb_label',
                    'examples_eyebrow',
                    'example_card_label',
                    'connect_eyebrow',
                    'connect_card_badge',
                    'copy_button_text',
                    'permissions_eyebrow',
                    'safeguards_eyebrow',
                    'data_eyebrow',
                    'faq_eyebrow',
                    'faq_subtitle',
                    'legal_note_prefix',
                    'privacy_link_text',
                    'terms_link_text'
                  )
                }
              />
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField
                label="Breadcrumb Label"
                value={content.breadcrumb_label}
                onChange={(v) => setC('breadcrumb_label', v)}
              />
              <TextField
                label="Examples Eyebrow"
                value={content.examples_eyebrow}
                onChange={(v) => setC('examples_eyebrow', v)}
              />
              <TextField
                label="Example Card Label"
                value={content.example_card_label}
                onChange={(v) => setC('example_card_label', v)}
              />
              <TextField
                label="Connect Eyebrow"
                value={content.connect_eyebrow}
                onChange={(v) => setC('connect_eyebrow', v)}
              />
              <TextField
                label="Connect Card Badge"
                value={content.connect_card_badge}
                onChange={(v) => setC('connect_card_badge', v)}
              />
              <TextField
                label="Copy URL Button"
                value={content.copy_button_text}
                onChange={(v) => setC('copy_button_text', v)}
              />
              <TextField
                label="Permissions Eyebrow"
                value={content.permissions_eyebrow}
                onChange={(v) => setC('permissions_eyebrow', v)}
              />
              <TextField
                label="Safeguards Eyebrow"
                value={content.safeguards_eyebrow}
                onChange={(v) => setC('safeguards_eyebrow', v)}
              />
              <TextField
                label="Data Eyebrow"
                value={content.data_eyebrow}
                onChange={(v) => setC('data_eyebrow', v)}
              />
              <TextField
                label="FAQ Eyebrow"
                value={content.faq_eyebrow}
                onChange={(v) => setC('faq_eyebrow', v)}
              />
              <TextField
                label="FAQ Subtitle"
                value={content.faq_subtitle}
                onChange={(v) => setC('faq_subtitle', v)}
                rows={2}
                className="md:col-span-2"
              />
              <TextField
                label="Legal Note Prefix"
                value={content.legal_note_prefix}
                onChange={(v) => setC('legal_note_prefix', v)}
                hint="Followed by the privacy policy and terms links under “Your data”."
                className="md:col-span-2"
              />
              <TextField
                label="Privacy Link Text"
                value={content.privacy_link_text}
                onChange={(v) => setC('privacy_link_text', v)}
              />
              <TextField
                label="Terms Link Text"
                value={content.terms_link_text}
                onChange={(v) => setC('terms_link_text', v)}
              />
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: FAQs */}
        <TabsContent value="faqs" className="space-y-6">
          <Card
            title="Frequently Asked Questions"
            icon={<HelpCircle className="h-5 w-5 text-emerald-500" />}
            description="Shown as an accordion on the public page."
            actions={
              <>
                <ResetButton
                  onClick={() => {
                    updateField('faqs', clone(AI_PAGE_DEFAULT_FAQS));
                    resetC('faq_heading');
                  }}
                />
                <AddButton
                  label="Add FAQ"
                  onClick={() =>
                    updateField('faqs', [
                      ...page.faqs,
                      { question: 'New question?', answer: 'Answer text.' },
                    ])
                  }
                />
              </>
            }
          >
            <Field label="Heading" className="mb-4">
              <Input
                value={content.faq_heading}
                onChange={(e) => setC('faq_heading', e.target.value)}
              />
            </Field>
            <div className="space-y-3">
              {page.faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={faq.question}
                      onChange={(e) =>
                        updateFaq(idx, 'question', e.target.value)
                      }
                      aria-label={`Question ${idx + 1}`}
                      placeholder="Question"
                      className="bg-white font-medium"
                    />
                    <RemoveButton
                      label={`Remove question ${idx + 1}`}
                      onClick={() =>
                        updateField(
                          'faqs',
                          page.faqs.filter((_, i) => i !== idx)
                        )
                      }
                    />
                  </div>
                  <Textarea
                    rows={3}
                    value={faq.answer}
                    onChange={(e) => updateFaq(idx, 'answer', e.target.value)}
                    aria-label={`Answer ${idx + 1}`}
                    placeholder="Answer"
                    className="bg-white"
                  />
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* TAB 4: SEO & STATUS */}
        <TabsContent value="seo" className="space-y-4">
          <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Publishing Status
                </h2>
                <p className="max-w-xl text-xs text-slate-500">
                  Published: the page shows your edits. Draft: the page stays
                  online with the default copy, because the Claude and ChatGPT
                  listings link to it.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {page.is_published ? 'Published' : 'Draft'}
                </span>
                <Switch
                  checked={page.is_published}
                  onCheckedChange={(val) => updateField('is_published', val)}
                  aria-label="Published"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Search className="h-4 w-4 text-slate-500" />
                  SEO Metadata
                </h2>
                <ResetButton
                  onClick={() =>
                    setPage((prev) =>
                      prev
                        ? {
                            ...prev,
                            seo_meta_title: AI_PAGE_DEFAULTS.seo_meta_title,
                            seo_meta_description:
                              AI_PAGE_DEFAULTS.seo_meta_description,
                          }
                        : prev
                    )
                  }
                />
              </div>
              <Field label="Meta Title">
                <Input
                  value={page.seo_meta_title}
                  onChange={(e) =>
                    updateField('seo_meta_title', e.target.value)
                  }
                  placeholder="Page title for search engines"
                />
              </Field>
              <Field label="Meta Description">
                <Textarea
                  rows={3}
                  value={page.seo_meta_description}
                  onChange={(e) =>
                    updateField('seo_meta_description', e.target.value)
                  }
                  placeholder="Summary for search results"
                />
              </Field>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
