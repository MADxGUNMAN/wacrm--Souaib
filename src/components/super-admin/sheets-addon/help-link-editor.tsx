'use client';

// ============================================================
// Editor for the Get Support / Resources buttons in the add-on dialog.
//
// WHY LINKS SAVE IMMEDIATELY AND THE COPY DOES NOT
// The surrounding page batches its text fields behind one Save button,
// which suits free typing. Links are different: reorder and enable are
// single-click actions, and a click that visibly moves a row but needs
// a second click elsewhere to stick is how people lose work. So every
// mutation here is its own request, and the row shows a spinner while
// it is in flight.
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Globe,
  Link as LinkIcon,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type {
  SheetsAddonHelpIcon,
  SheetsAddonHelpLink,
  SheetsAddonHelpSection,
} from '@/types/super-admin';

/**
 * Lucide stand-ins for the add-on's inline SVGs.
 *
 * Only an approximation: the dialog draws its own hand-written SVG, and
 * lucide has no WhatsApp brand mark, so `whatsapp` shows a generic chat
 * bubble here. Close enough for picking an icon, which is all this is for.
 */
export const HELP_ICON_COMPONENTS: Record<
  SheetsAddonHelpIcon,
  typeof LinkIcon
> = {
  whatsapp: MessageCircle,
  mail: Mail,
  calendar: CalendarDays,
  book: BookOpen,
  globe: Globe,
  link: LinkIcon,
};

const ICON_LABELS: Record<SheetsAddonHelpIcon, string> = {
  whatsapp: 'WhatsApp',
  mail: 'Email',
  calendar: 'Calendar',
  book: 'Docs',
  globe: 'Website',
  link: 'Generic link',
};

const ICON_OPTIONS = Object.keys(ICON_LABELS) as SheetsAddonHelpIcon[];

interface HelpLinkEditorProps {
  section: SheetsAddonHelpSection;
  links: SheetsAddonHelpLink[];
  /** Called with the authoritative row after any successful mutation. */
  onChanged: (links: SheetsAddonHelpLink[]) => void;
}

export function HelpLinkEditor({
  section,
  links,
  onChanged,
}: HelpLinkEditorProps) {
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const rows = links
    .filter((link) => link.section === section)
    .sort((a, b) => a.sort_order - b.sort_order);

  const replaceRow = (updated: SheetsAddonHelpLink) => {
    onChanged(links.map((link) => (link.id === updated.id ? updated : link)));
  };

  const patchLink = async (
    id: string,
    patch: Partial<SheetsAddonHelpLink>,
    options: { silent?: boolean } = {}
  ) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/sheets-addon/links/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save the link');
      replaceRow(data.link as SheetsAddonHelpLink);
      if (!options.silent) toast.success('Link updated.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const createLink = async () => {
    setIsCreating(true);
    try {
      const res = await fetch('/api/super-admin/sheets-addon/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          label: '',
          description: '',
          url: '',
          icon: 'link',
          // New rows arrive disabled: an empty row that is live from the
          // moment it appears would be a blank button in the dialog.
          is_enabled: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not add the link');
      onChanged([...links, data.link as SheetsAddonHelpLink]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteLink = async (link: SheetsAddonHelpLink) => {
    const ok = await confirm({
      title: 'Delete this link?',
      description: link.label
        ? `"${link.label}" will be removed from the add-on dialog.`
        : 'This empty link row will be removed.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
      icon: Trash2,
    });
    if (!ok) return;

    setBusyId(link.id);
    try {
      const res = await fetch(
        `/api/super-admin/sheets-addon/links/${link.id}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not delete the link');
      onChanged(links.filter((row) => row.id !== link.id));
      toast.success('Link deleted.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Reorder by swapping the two rows' sort_order values.
   *
   * Swapping rather than renumbering the whole list keeps it to two
   * requests and cannot leave the list half-renumbered if the second
   * one fails.
   */
  const move = async (index: number, direction: -1 | 1) => {
    const current = rows[index];
    const neighbour = rows[index + direction];
    if (!current || !neighbour) return;

    setBusyId(current.id);
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/super-admin/sheets-addon/links/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: neighbour.sort_order }),
        }).then((r) => r.json()),
        fetch(`/api/super-admin/sheets-addon/links/${neighbour.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: current.sort_order }),
        }).then((r) => r.json()),
      ]);

      if (!a.link || !b.link) throw new Error('Could not reorder the links');

      const byId = new Map<string, SheetsAddonHelpLink>([
        [a.link.id, a.link],
        [b.link.id, b.link],
      ]);
      onChanged(links.map((link) => byId.get(link.id) ?? link));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
          No links yet. Add one and it will appear in the add-on dialog.
        </p>
      ) : null}

      {rows.map((link, index) => {
        const Icon = HELP_ICON_COMPONENTS[link.icon];
        const isBusy = busyId === link.id;
        // The one state worth warning about: live but pointing nowhere.
        // The public endpoint drops these, so the operator would see a
        // missing button with no explanation.
        const isLiveButBlank = link.is_enabled && !link.url.trim();

        return (
          <div
            key={link.id}
            className={cn(
              'space-y-3 rounded-xl border bg-white p-4 shadow-sm transition-opacity',
              isLiveButBlank ? 'border-amber-300' : 'border-slate-200',
              isBusy && 'opacity-60'
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icon className="size-4" />
                )}
              </div>

              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  value={link.label}
                  placeholder="Button label, e.g. WhatsApp Support"
                  disabled={isBusy}
                  onChange={(e) =>
                    replaceRow({ ...link, label: e.target.value })
                  }
                  onBlur={(e) =>
                    patchLink(
                      link.id,
                      { label: e.target.value },
                      { silent: true }
                    )
                  }
                  className="h-9 border-slate-200 bg-white text-sm text-slate-900"
                />
                <Input
                  value={link.description}
                  placeholder="Sub-label, e.g. Chat instantly"
                  disabled={isBusy}
                  onChange={(e) =>
                    replaceRow({ ...link, description: e.target.value })
                  }
                  onBlur={(e) =>
                    patchLink(
                      link.id,
                      { description: e.target.value },
                      { silent: true }
                    )
                  }
                  className="h-9 border-slate-200 bg-white text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={link.url}
                placeholder="https://… or mailto:support@example.com"
                disabled={isBusy}
                onChange={(e) => replaceRow({ ...link, url: e.target.value })}
                onBlur={(e) =>
                  patchLink(link.id, { url: e.target.value }, { silent: true })
                }
                className="h-9 flex-1 border-slate-200 bg-white font-mono text-xs text-slate-900"
              />

              <Select
                value={link.icon}
                disabled={isBusy}
                onValueChange={(value) => {
                  if (!value) return;
                  patchLink(link.id, { icon: value as SheetsAddonHelpIcon });
                }}
              >
                <SelectTrigger className="h-9 w-full border-slate-200 bg-white text-xs sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ICON_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLiveButBlank ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                <span>
                  This link is on but has no URL, so the add-on hides it. Add a
                  URL or switch it off.
                </span>
              </p>
            ) : null}

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <Switch
                  checked={link.is_enabled}
                  disabled={isBusy}
                  onCheckedChange={(value) =>
                    patchLink(link.id, { is_enabled: value })
                  }
                />
                {link.is_enabled ? 'Shown in the dialog' : 'Hidden'}
              </label>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-slate-500 hover:text-slate-900"
                  disabled={isBusy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <span className="sr-only">Move up</span>
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-slate-500 hover:text-slate-900"
                  disabled={isBusy || index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <span className="sr-only">Move down</span>
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                  disabled={isBusy}
                  onClick={() => deleteLink(link)}
                >
                  <span className="sr-only">Delete link</span>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        onClick={createLink}
        disabled={isCreating}
        className="border-slate-200"
      >
        {isCreating ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Plus className="mr-2 size-4" />
        )}
        Add link
      </Button>
    </div>
  );
}
