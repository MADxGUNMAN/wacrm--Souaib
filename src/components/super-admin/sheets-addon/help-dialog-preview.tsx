'use client';

// ============================================================
// Approximate render of the add-on's Help & Support dialog.
//
// WHY THIS EXISTS
// The real dialog only appears inside a Google Sheet, behind a clasp
// push. Without a preview, writing this copy means editing 21 text
// fields blind and then opening a spreadsheet to find out that a
// heading wrapped onto three lines. The dialog is a fixed 480px modal,
// so length is a real constraint and needs to be visible while typing.
//
// WHAT IT IS NOT
// Not the same code as the dialog — that is Apps Script HTML rendered
// in an HtmlService iframe and cannot be imported here. This mirrors
// its layout, widths and the brand green (#25d366) so the proportions
// are honest, but it is a facsimile. Treat it as a ruler, not a
// guarantee.
//
// It deliberately applies the SAME visibility rules as the public
// endpoint: a link that is disabled or has no URL does not appear, so
// the preview cannot promise a button the add-on will not draw.
// ============================================================

import { Link as LinkIcon } from 'lucide-react';

import { HELP_ICON_COMPONENTS } from './help-link-editor';
import type {
  SheetsAddonHelpLink,
  SheetsAddonHelpSettings,
} from '@/types/super-admin';

interface HelpDialogPreviewProps {
  settings: Partial<SheetsAddonHelpSettings>;
  links: SheetsAddonHelpLink[];
}

/** Mirrors `loadHelpContent`: enabled, non-blank URL, in order. */
function visibleLinks(
  links: SheetsAddonHelpLink[],
  section: 'support' | 'resources'
) {
  return links
    .filter(
      (link) =>
        link.section === section && link.is_enabled && link.url.trim() !== ''
    )
    .sort((a, b) => a.sort_order - b.sort_order);
}

function LinkRow({ link }: { link: SheetsAddonHelpLink }) {
  const Icon = HELP_ICON_COMPONENTS[link.icon] ?? LinkIcon;
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-[#e6e6eb] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <Icon className="size-3.5 shrink-0 text-[#20b958]" />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#2b2c31]">
        {link.label || <span className="text-[#6f7280]">Untitled</span>}
        {link.description ? (
          <span className="font-normal text-[#6f7280]">
            {' · '}
            {link.description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function SectionHeading({ text }: { text: string }) {
  // Blank headings are hidden rather than rendered as an empty strip —
  // the same rule the dialog follows, so this stays honest.
  if (!text.trim()) return null;
  return <h4 className="text-[12px] font-semibold text-[#2b2c31]">{text}</h4>;
}

export function HelpDialogPreview({ settings, links }: HelpDialogPreviewProps) {
  const support = visibleLinks(links, 'support');
  const resources = visibleLinks(links, 'resources');

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500 uppercase">
        Add-on preview
      </p>

      {/* Fixed 400px to stand in for the dialog's 480px minus its padding,
          so wrapping behaviour here is representative. */}
      <div className="w-full max-w-[400px] overflow-hidden rounded-xl border border-slate-300 bg-[#fbfbfd] shadow-md">
        {/* Header — brand green, mirroring the dialog's own banner. */}
        <div className="bg-[#25d366] px-4 py-3 text-center text-white">
          <p className="text-[14px] font-semibold">
            {settings.dialog_title?.trim() || 'Help & Support'}
          </p>
          {settings.dialog_subtitle?.trim() ? (
            <p className="mt-0.5 text-[11px] text-white/85">
              {settings.dialog_subtitle}
            </p>
          ) : null}
        </div>

        <div className="max-h-[440px] space-y-3.5 overflow-y-auto overscroll-contain p-4">
          {support.length > 0 ? (
            <section className="space-y-1.5">
              <SectionHeading text={settings.support_heading ?? ''} />
              {support.map((link) => (
                <LinkRow key={link.id} link={link} />
              ))}
            </section>
          ) : null}

          {resources.length > 0 ? (
            <section className="space-y-1.5">
              <SectionHeading text={settings.resources_heading ?? ''} />
              {resources.map((link) => (
                <LinkRow key={link.id} link={link} />
              ))}
            </section>
          ) : null}

          <section className="space-y-1.5">
            <SectionHeading text={settings.maintenance_heading ?? ''} />
            {settings.maintenance_description?.trim() ? (
              <p className="text-[11px] text-[#6f7280]">
                {settings.maintenance_description}
              </p>
            ) : null}
            {[
              {
                label: settings.reinstall_label,
                description: settings.reinstall_description,
              },
              {
                label: settings.disconnect_label,
                description: settings.disconnect_description,
              },
            ].map((action, index) =>
              action.label?.trim() ? (
                <div
                  key={index}
                  className="rounded-md border border-[#e6e6eb] bg-white px-3 py-2"
                >
                  <p className="text-[12px] font-medium text-[#2b2c31]">
                    {action.label}
                  </p>
                  {action.description?.trim() ? (
                    <p className="mt-0.5 text-[11px] text-[#6f7280]">
                      {action.description}
                    </p>
                  ) : null}
                </div>
              ) : null
            )}
          </section>

          {settings.is_reset_enabled ? (
            <section className="space-y-1.5 rounded-md border border-[#fec84b] bg-[#fffaeb] p-3">
              {settings.reset_heading?.trim() ? (
                <p className="text-[12px] font-semibold text-[#7a4100]">
                  ⚠ {settings.reset_heading}
                </p>
              ) : null}
              {settings.reset_description?.trim() ? (
                <p className="text-[11px] text-[#7a4100]">
                  {settings.reset_description}
                </p>
              ) : null}
              {settings.reset_button_label?.trim() ? (
                <span className="inline-flex rounded-md bg-[#d92d20] px-2.5 py-1 text-[11px] font-medium text-white">
                  {settings.reset_button_label}
                </span>
              ) : null}
            </section>
          ) : null}

          {settings.is_report_enabled ? (
            <section className="space-y-1.5">
              <SectionHeading text={settings.report_heading ?? ''} />
              <div className="space-y-2 rounded-md border border-[#e6e6eb] bg-white p-3">
                {settings.report_intro?.trim() ? (
                  <p className="text-[11px] text-[#6f7280]">
                    {settings.report_intro}
                  </p>
                ) : null}
                <div className="rounded-md border border-[#e6e6eb] px-2.5 py-2 text-[11px] text-[#9a9ca5]">
                  {settings.report_placeholder?.trim() ||
                    'Describe your issue…'}
                </div>
                {settings.report_button_label?.trim() ? (
                  <span className="inline-flex w-full items-center justify-center rounded-md bg-[#25d366] px-3 py-1.5 text-[11px] font-medium text-white">
                    {settings.report_button_label}
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {settings.footer_text?.trim() ? (
            <p className="pt-1 text-center text-[11px] text-[#20b958]">
              {settings.footer_text}
            </p>
          ) : null}
        </div>
      </div>

      <p className="max-w-[400px] text-[11px] leading-relaxed text-slate-400">
        Approximate. Disabled links and links without a URL are hidden here
        because the add-on hides them too.
      </p>
    </div>
  );
}
