'use client';

import {
  Copy,
  ExternalLink,
  FileText,
  Film,
  ImageOff,
  List,
  MapPin,
  Phone,
  PhoneCall,
  Reply,
  ShoppingBag,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TemplateButton } from '@/types';
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

export interface TemplateRenderData {
  /** The full parsed definition from Meta components / template row */
  definition?: TemplateDefinition | null;
  /** TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION — Meta's header formats. */
  headerType?: string | null;
  /** Header text for a TEXT header. May contain unfilled {{n}}. */
  headerContent?: string | null;
  /** Resolved media URL for a media header, when one is known. */
  headerMediaUrl?: string | null;
  /** Footer text. Always static in Meta templates. */
  footerText?: string | null;
  buttons?: TemplateButton[] | null;
  bodyText?: string | null;
}

/** Icon per button type matching WhatsApp Web styling */
function ButtonIcon({ type }: { type: string }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  switch (type) {
    case 'URL':
      return <ExternalLink className={cls} />;
    case 'PHONE_NUMBER':
      return <Phone className={cls} />;
    case 'COPY_CODE':
      return <Copy className={cls} />;
    case 'QUICK_REPLY':
      return <Reply className={cls} />;
    case 'FLOW':
      return <Workflow className={cls} />;
    case 'MPM':
    case 'CATALOG':
      return <ShoppingBag className={cls} />;
    case 'ORDER_DETAILS':
      return <FileText className={cls} />;
    case 'VOICE_CALL':
      return <PhoneCall className={cls} />;
    default:
      return <List className={cls} />;
  }
}

function buttonLabel(button: TemplateButton | MetaTemplateButton): string {
  const explicit = button.text?.trim();
  if (explicit) return explicit;
  switch (button.type as string) {
    case 'COPY_CODE':
      return 'Copy code';
    case 'MPM':
      return 'View items';
    case 'CATALOG':
      return 'View catalog';
    case 'ORDER_DETAILS':
      return 'Review and pay';
    case 'VOICE_CALL':
      return 'Call';
    default:
      return 'Button';
  }
}

function MediaHeader({
  headerType,
  url,
}: {
  headerType: string;
  url?: string | null;
}) {
  if (headerType === 'IMAGE') {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Template header"
        className="aspect-[1.91/1] w-full object-cover"
      />
    ) : (
      <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted">
        <ImageOff className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (headerType === 'VIDEO') {
    return url ? (
      <video src={url} controls className="aspect-[1.91/1] w-full bg-black object-cover" />
    ) : (
      <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted">
        <Film className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (headerType === 'DOCUMENT') {
    return (
      <div className="flex items-center gap-2 bg-muted/60 px-3 py-2">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs text-muted-foreground">Document</span>
      </div>
    );
  }

  if (headerType === 'LOCATION') {
    return (
      <div className="flex items-center gap-2 bg-muted/60 px-3 py-2">
        <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs text-muted-foreground">Location</span>
      </div>
    );
  }

  return null;
}

/** Renders horizontal scrollable carousel cards matching WhatsApp Web */
function CarouselCards({ cards }: { cards: CarouselCard[] }) {
  return (
    <div className="mt-2 flex snap-x gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
      {cards.map((card, i) => {
        const header = getHeader(card.components as TemplateComponent[]);
        const body = getBody(card.components as TemplateComponent[]);
        const buttons = getButtons(card.components as TemplateComponent[]);
        const cardBody = resolveBodyText(body);
        const isMedia =
          header &&
          (header.format === 'IMAGE' ||
            header.format === 'VIDEO' ||
            header.format === 'DOCUMENT');
        const cardMediaUrl = isMedia
          ? header.example?.header_url?.[0] || header.example?.header_handle?.[0]
          : undefined;

        return (
          <div
            key={i}
            className="w-[195px] shrink-0 snap-start overflow-hidden rounded-lg bg-card text-card-foreground border border-border shadow-xs flex flex-col justify-between"
          >
            <div>
              {header ? (
                <div className="overflow-hidden bg-muted/50">
                  {header.format === 'IMAGE' ? (
                    cardMediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cardMediaUrl}
                        alt={`Card ${i + 1}`}
                        className="aspect-[1.91/1] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted/70">
                        <ImageOff className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    )
                  ) : header.format === 'VIDEO' ? (
                    <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted/70">
                      <Film className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {cardBody ? (
                <div className="px-2.5 py-2">
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                    {cardBody}
                  </p>
                </div>
              ) : null}
            </div>

            {buttons && buttons.length > 0 ? (
              <div className="flex flex-col border-t border-border divide-y divide-border">
                {buttons.slice(0, 2).map((btn, bi) => (
                  <button
                    key={`${btn.type}-${bi}`}
                    type="button"
                    disabled
                    className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-primary hover:bg-muted/20 cursor-default"
                  >
                    <ButtonIcon type={btn.type} />
                    <span className="truncate px-1.5">{btn.text || buttonLabel(btn)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TemplateMessage({
  body,
  template,
  className,
}: {
  /** The message's stored content_text — variables already filled. */
  body?: string | null;
  /** Header/footer/buttons from the template definition, when resolvable. */
  template?: TemplateRenderData | null;
  className?: string;
}) {
  const def = template?.definition;
  const components = def?.components ?? [];

  const header = getHeader(components);
  const bodyComp = getBody(components);
  const footer = getFooter(components);
  const buttons = (getButtons(components).length > 0 ? getButtons(components) : (template?.buttons ?? [])).filter(Boolean);
  const cards = getCarouselCards(components);
  const lto = findComponent(components, 'LIMITED_TIME_OFFER');

  const resolvedBody = body?.trim() || resolveBodyText(bodyComp) || template?.bodyText || '';
  const footerText = resolveFooterText(footer) || template?.footerText || null;

  const headerType = (header?.type === 'HEADER' ? header.format : template?.headerType)?.toUpperCase() ?? null;
  const isTextHeader = headerType === 'TEXT';
  const isMediaHeader =
    headerType === 'IMAGE' ||
    headerType === 'VIDEO' ||
    headerType === 'DOCUMENT' ||
    headerType === 'LOCATION';

  const headerText =
    header && header.format === 'TEXT'
      ? header.text
      : template?.headerContent;
  const isHeaderMedia =
    header &&
    (header.format === 'IMAGE' ||
      header.format === 'VIDEO' ||
      header.format === 'DOCUMENT');
  const headerMediaUrl =
    template?.headerMediaUrl ||
    (isHeaderMedia
      ? header.example?.header_url?.[0] || header.example?.header_handle?.[0]
      : null);

  const isCarousel = cards.length > 0;

  return (
    <div
      className={cn(
        'w-full overflow-hidden text-foreground',
        isCarousel ? 'max-w-[480px]' : 'max-w-[320px]',
        className
      )}
    >
      <div className="overflow-hidden rounded-lg bg-card text-foreground ring-1 ring-border shadow-xs">
        {isMediaHeader ? (
          <MediaHeader
            headerType={headerType!}
            url={headerMediaUrl}
          />
        ) : null}

        {lto ? (
          <div className="mx-2 mt-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              {lto.limited_time_offer.text || 'Limited-time offer'}
            </p>
            {lto.limited_time_offer.has_expiration ? (
              <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
                Offer ends soon
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="px-3 py-2 space-y-1">
          {isTextHeader && headerText?.trim() ? (
            <p className="break-words text-sm font-semibold text-foreground">
              {headerText}
            </p>
          ) : null}

          {resolvedBody ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {resolvedBody}
            </p>
          ) : null}

          {footerText?.trim() ? (
            <p className="break-words text-[11px] text-muted-foreground pt-0.5">
              {footerText}
            </p>
          ) : null}
        </div>

        {buttons.length > 0 ? (
          <div className="flex flex-col border-t border-border divide-y divide-border">
            {buttons.map((button, i) => (
              <button
                key={`${button.type}-${i}`}
                type="button"
                disabled
                className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-primary hover:bg-muted/20 cursor-default"
              >
                <ButtonIcon type={button.type} />
                <span className="truncate px-2">
                  {'text' in button && button.text ? button.text : buttonLabel(button)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isCarousel ? <CarouselCards cards={cards} /> : null}
    </div>
  );
}
