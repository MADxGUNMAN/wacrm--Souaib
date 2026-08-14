'use client';

// ============================================================
// A WhatsApp-style preview of a message template.
//
// ─── Why it renders from `components` ─────────────────────────────
//
// The input is a TemplateDefinition — the same `components` array that
// gets POSTed to Meta. Rendering from anything else (the flat columns, or
// the form state) would let the preview and the submitted template drift,
// which is the one thing a preview must never do.
//
// ─── Fidelity notes ──────────────────────────────────────────────
//
// Colours and metrics are taken from the WhatsApp client: chat wallpaper
// #ECE5DD, outgoing bubble #FFFFFF, body #111B21, meta text #667781,
// action text #00A5F4, hairline dividers #E9EDEF. Hardcoded rather than
// mapped to our theme tokens on purpose — this is a picture of somebody
// else's app, so it must stay fixed when Replai switches to dark mode.
// A dark preview would be a lie about what the customer sees.
//
// The doodle wallpaper is not reproduced (it is Meta's artwork); the flat
// beige is the closest honest approximation.
// ============================================================

import {
  Copy,
  ExternalLink,
  FileText,
  MapPin,
  Phone,
  Play,
  Reply,
  ShoppingBag,
  Store,
  Workflow,
} from 'lucide-react';

import {
  getButtons,
  getBody,
  getCarouselCards,
  getFooter,
  getHeader,
  findComponent,
  resolveBodyText,
  resolveFooterText,
  type CarouselCard,
  type HeaderComponent,
  type MetaTemplateButton,
  type TemplateComponent,
  type TemplateDefinition,
} from '@/lib/whatsapp/template-definition';
import {
  buildPreviewSegments,
  type PreviewSegment,
} from '@/lib/whatsapp/template-preview-text';
import { cn } from '@/lib/utils';

/** Values for `{{…}}`, keyed as written (`'1'` for `{{1}}`). */
export type PreviewValues = Record<string, string | undefined>;

// ------------------------------------------------------------
// Text
// ------------------------------------------------------------

function Segments({ segments }: { segments: PreviewSegment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.placeholder ? (
          // An unfilled variable. Shown as a chip so a missing sample
          // value is obvious rather than looking like literal braces the
          // customer would receive.
          <span
            key={i}
            className="rounded bg-[#D9FDD3] px-1 py-px font-medium text-[#1F7A3D]"
          >
            {s.text}
          </span>
        ) : (
          <span
            key={i}
            className={cn(
              s.bold && 'font-bold',
              s.italic && 'italic',
              s.strike && 'line-through',
              s.mono && 'font-mono text-[13px]',
            )}
          >
            {s.text}
          </span>
        ),
      )}
    </>
  );
}

// ------------------------------------------------------------
// Header
// ------------------------------------------------------------

function HeaderBlock({
  header,
  values,
}: {
  header: HeaderComponent;
  values: PreviewValues;
}) {
  if (header.format === 'TEXT') {
    return (
      <p className="px-2.5 pt-2 text-[15px] leading-tight font-bold text-[#111B21]">
        <Segments segments={buildPreviewSegments(header.text, values)} />
      </p>
    );
  }

  if (header.format === 'IMAGE') {
    const url = header.example?.header_url?.[0];
    return (
      <div className="m-1.5 mb-0 overflow-hidden rounded-[6px] bg-[#CCD0D5]">
        {url ? (
          /* A plain img, not next/image: the src is an arbitrary
             operator-supplied sample URL, which next/image would require
             be whitelisted in `remotePatterns` — impossible for user
             input. `unoptimized` would work around that but then
             next/image adds ceremony for no benefit. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="aspect-[1.91/1] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[1.91/1] w-full items-center justify-center">
            <ShoppingBag className="size-7 text-white/70" />
          </div>
        )}
      </div>
    );
  }

  if (header.format === 'VIDEO') {
    return (
      <div className="m-1.5 mb-0 flex aspect-[1.91/1] items-center justify-center rounded-[6px] bg-[#2A3942]">
        <span className="flex size-10 items-center justify-center rounded-full bg-black/40">
          <Play className="size-5 fill-white text-white" />
        </span>
      </div>
    );
  }

  if (header.format === 'DOCUMENT') {
    return (
      <div className="m-1.5 mb-0 flex items-center gap-2.5 rounded-[6px] bg-[#F5F6F6] px-3 py-2.5">
        <FileText className="size-6 shrink-0 text-[#EA4335]" />
        <span className="truncate text-[13px] text-[#111B21]">
          Attached document
        </span>
      </div>
    );
  }

  // LOCATION
  return (
    <div className="m-1.5 mb-0 flex aspect-[2/1] items-center justify-center rounded-[6px] bg-[#DCE3E3]">
      <MapPin className="size-6 text-[#5A6B6B]" />
    </div>
  );
}

// ------------------------------------------------------------
// Buttons
// ------------------------------------------------------------

function buttonIcon(type: MetaTemplateButton['type']) {
  switch (type) {
    case 'URL':
      return ExternalLink;
    case 'PHONE_NUMBER':
    case 'VOICE_CALL':
      return Phone;
    case 'COPY_CODE':
    case 'OTP':
      return Copy;
    case 'CATALOG':
      return Store;
    case 'MPM':
      return ShoppingBag;
    case 'FLOW':
      return Workflow;
    default:
      return Reply;
  }
}

function buttonLabel(b: MetaTemplateButton): string {
  if (b.type === 'OTP') return b.text || 'Copy code';
  // A Flow button with no label would render as a generic "Button", which
  // hides what it does; the editor requires one, but a synced row might
  // not have it.
  if (b.type === 'FLOW') return b.text || 'Open form';
  return b.text || 'Button';
}

function ButtonRows({ buttons }: { buttons: MetaTemplateButton[] }) {
  if (buttons.length === 0) return null;

  // WhatsApp collapses anything past the third button behind a single
  // "See all options" row. Showing all ten would misrepresent the layout
  // the customer actually gets.
  const visible = buttons.slice(0, 3);
  const hidden = buttons.length - visible.length;

  return (
    <div className="mt-1">
      {visible.map((b, i) => {
        const Icon = buttonIcon(b.type);
        return (
          <div
            key={i}
            className="flex items-center justify-center gap-1.5 border-t border-[#E9EDEF] py-2 text-[14px] font-medium text-[#00A5F4]"
          >
            <Icon className="size-3.5" />
            <span className="truncate">{buttonLabel(b)}</span>
          </div>
        );
      })}
      {hidden > 0 ? (
        <div className="flex items-center justify-center gap-1.5 border-t border-[#E9EDEF] py-2 text-[14px] font-medium text-[#00A5F4]">
          <Reply className="size-3.5" />
          See all options
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------
// Carousel
// ------------------------------------------------------------

function CarouselStrip({
  cards,
  values,
}: {
  cards: CarouselCard[];
  values: PreviewValues;
}) {
  return (
    <div className="-mx-1 mt-1.5 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {cards.map((card, i) => {
        const header = getHeader(card.components as TemplateComponent[]);
        const body = getBody(card.components as TemplateComponent[]);
        const buttons = getButtons(card.components as TemplateComponent[]);
        return (
          <div
            key={i}
            className="w-[190px] shrink-0 snap-start overflow-hidden rounded-[7.5px] bg-white shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
          >
            {header ? <HeaderBlock header={header} values={values} /> : null}
            {resolveBodyText(body) ? (
              <p className="px-2.5 py-1.5 text-[13px] leading-[18px] whitespace-pre-wrap text-[#111B21]">
                <Segments
                  segments={buildPreviewSegments(resolveBodyText(body), values)}
                />
              </p>
            ) : null}
            <ButtonRows buttons={buttons.slice(0, 2)} />
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// Root
// ------------------------------------------------------------

export function WhatsAppPreview({
  definition,
  values = {},
  headerValues,
  timestamp = '11:59',
  className,
}: {
  definition: TemplateDefinition;
  /** Values for the body and footer. */
  values?: PreviewValues;
  /**
   * Values for the header, which is a SEPARATE namespace in Meta's
   * model — a text header may only use `{{1}}`, and that `{{1}}` is not
   * the body's `{{1}}`. Defaults to `values` for callers whose template
   * has no header variable, where the distinction cannot matter.
   */
  headerValues?: PreviewValues;
  timestamp?: string;
  className?: string;
}) {
  const resolvedHeaderValues = headerValues ?? values;
  const { components } = definition;
  const header = getHeader(components);
  const body = getBody(components);
  const footer = getFooter(components);
  const buttons = getButtons(components);
  const cards = getCarouselCards(components);
  const lto = findComponent(components, 'LIMITED_TIME_OFFER');

  // resolveBodyText/resolveFooterText synthesise Meta's preset wording
  // for AUTHENTICATION templates, whose components carry no text — so an
  // OTP template previews as the message the customer really gets
  // instead of an empty bubble.
  const footerText = resolveFooterText(footer);
  const bodySegments = buildPreviewSegments(resolveBodyText(body), values);
  const isEmpty = bodySegments.length === 0 && !header;

  return (
    <div
      className={cn('rounded-lg bg-[#ECE5DD] p-3', className)}
      // The preview is decorative duplication of form fields that are
      // already labelled and readable, so it is hidden from screen
      // readers rather than read out twice in a different order.
      aria-hidden="true"
    >
      <div className="max-w-[300px] overflow-hidden rounded-[7.5px] bg-white shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
        {header ? (
          <HeaderBlock header={header} values={resolvedHeaderValues} />
        ) : null}

        {/* Limited-time offer strip sits above the body in the client. */}
        {lto ? (
          <div className="mx-1.5 mt-1.5 rounded-[6px] bg-[#FFF3D6] px-2.5 py-1.5">
            <p className="text-[13px] font-semibold text-[#7A5B00]">
              {lto.limited_time_offer.text || 'Limited-time offer'}
            </p>
            {lto.limited_time_offer.has_expiration ? (
              <p className="text-[11px] text-[#9A7500]">
                Offer ends in 23:59:45
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="px-2.5 pt-1.5 pb-1">
          {isEmpty ? (
            <p className="text-[14px] text-[#8696A0] italic">
              Your message will appear here
            </p>
          ) : (
            <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap text-[#111B21]">
              <Segments segments={bodySegments} />
            </p>
          )}

          {footerText ? (
            <p className="mt-1.5 text-[13px] leading-[17px] text-[#667781]">
              <Segments segments={buildPreviewSegments(footerText, values)} />
            </p>
          ) : null}

          <p className="mt-0.5 text-right text-[11px] leading-[15px] text-[#667781]">
            {timestamp}
          </p>
        </div>

        <ButtonRows buttons={buttons} />
      </div>

      {cards.length > 0 ? (
        <CarouselStrip cards={cards} values={values} />
      ) : null}
    </div>
  );
}
