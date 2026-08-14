'use client';

// ============================================================
// Wizard step 2, CAROUSEL variant.
//
// The layout follows Meta's uniformity rules rather than fighting them.
// Meta requires every card to share the same header format and the same
// button types in the same order, so those two things are edited ONCE at
// the top and applied to every card. The alternative — a full editor per
// card — lets an operator build something that cannot pass review and
// only tells them at submit.
//
// Card count is also frozen at approval: a template approved with three
// cards can only ever send three. That is stated here, not discovered
// later.
// ============================================================

import { GripVertical, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CAROUSEL_LIMITS, TEMPLATE_LIMITS } from '@/lib/whatsapp/template-limits';
import { extractVariableIndices } from '@/lib/whatsapp/template-variables';
import { carouselNeedsSendInput } from '@/lib/whatsapp/template-definition';
import {
  definitionFromDraft,
  draftBodyValues,
  emptyCard,
  type CardDraft,
  type CarouselDraft,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';

const BUTTON_TYPE_LABEL: Record<CarouselDraft['buttonTypes'][number], string> = {
  QUICK_REPLY: 'Quick reply',
  URL: 'Visit website',
  PHONE_NUMBER: 'Call phone number',
};

export function WizardStepCarousel({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (fields: Partial<WizardDraft>) => void;
}) {
  const carousel = draft.carousel;
  const patchCarousel = (fields: Partial<CarouselDraft>) =>
    onChange({ carousel: { ...carousel, ...fields } });

  const patchCard = (index: number, fields: Partial<CardDraft>) =>
    patchCarousel({
      cards: carousel.cards.map((c, i) =>
        i === index ? { ...c, ...fields } : c,
      ),
    });

  const bodyVarCount = extractVariableIndices(draft.bodyText).length;

  // Adding or removing a shared button reshapes every card at once, which
  // is the only way to keep the types aligned across cards.
  const setButtonTypes = (types: CarouselDraft['buttonTypes']) =>
    patchCarousel({
      buttonTypes: types,
      cards: carousel.cards.map((c) => ({
        ...c,
        buttonValues: types.map(
          (_, i) =>
            c.buttonValues[i] ?? { text: '', url: '', example: '', phone: '' },
        ),
      })),
    });

  const definition = definitionFromDraft(draft, 'Marketing', 'carousel');
  const needsSendInput = carouselNeedsSendInput(definition);

  // Keep body sample rows in step with the variable count.
  const bodySamples = Array.from(
    { length: bodyVarCount },
    (_, i) => draft.bodySamples[i] ?? '',
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        {/* ---- Name + language ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Template name and language
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="car-name">Name your template</Label>
              <Input
                id="car-name"
                value={draft.name}
                onChange={(e) =>
                  onChange({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 512),
                  })
                }
                placeholder="summer_collection"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="car-lang">Select language</Label>
              <Input
                id="car-lang"
                value={draft.language}
                onChange={(e) => onChange({ language: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* ---- Message body (above the cards) ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Message text
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Appears above the cards. A carousel has no header or footer —
            the cards take their place.
          </p>
          <Textarea
            rows={3}
            value={draft.bodyText}
            onChange={(e) => onChange({ bodyText: e.target.value })}
            maxLength={TEMPLATE_LIMITS.bodyMaxLength}
            placeholder="Our new range is here, {{1}}. Use code {{2}} for 20% off."
            className="mt-3 resize-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {draft.bodyText.length}/{TEMPLATE_LIMITS.bodyMaxLength}
          </p>

          {bodyVarCount > 0 ? (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-foreground">
                Example values
              </p>
              {bodySamples.map((val, i) => (
                <Input
                  key={i}
                  value={val}
                  onChange={(e) => {
                    const next = [...bodySamples];
                    next[i] = e.target.value;
                    onChange({ bodySamples: next });
                  }}
                  placeholder={`Example for {{${i + 1}}}`}
                  aria-label={`Message example value ${i + 1}`}
                />
              ))}
            </div>
          ) : null}
        </section>

        {/* ---- Shared card shape ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Card layout
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            WhatsApp requires every card to be built the same way, so these
            apply to all of them.
          </p>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="car-format">Card media</Label>
            <Select
              value={carousel.headerFormat}
              onValueChange={(v) =>
                patchCarousel({
                  headerFormat: (v || 'image') as CarouselDraft['headerFormat'],
                })
              }
            >
              <SelectTrigger id="car-format" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Every card needs one — it cannot be left off. Images are cropped
              to a wide ratio on the customer&apos;s device.
            </p>
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>
                Buttons on every card{' '}
                <span className="text-muted-foreground">· optional</span>
              </Label>
              <Select
                value=""
                onValueChange={(v) => {
                  if (!v) return;
                  setButtonTypes([
                    ...carousel.buttonTypes,
                    v as CarouselDraft['buttonTypes'][number],
                  ]);
                }}
              >
                <SelectTrigger
                  className="w-auto gap-2"
                  aria-label="Add a button to every card"
                  disabled={
                    carousel.buttonTypes.length >=
                    CAROUSEL_LIMITS.maxButtonsPerCard
                  }
                >
                  <Plus className="size-4" />
                  Add button
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUICK_REPLY">Quick reply</SelectItem>
                  <SelectItem value="URL">Visit website</SelectItem>
                  <SelectItem value="PHONE_NUMBER">Call phone number</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {carousel.buttonTypes.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                No buttons. Cards will show media and text only. Max{' '}
                {CAROUSEL_LIMITS.maxButtonsPerCard}.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {carousel.buttonTypes.map((type, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span className="text-sm text-foreground">
                      {BUTTON_TYPE_LABEL[type]}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-7"
                      aria-label={`Remove button ${i + 1} from every card`}
                      onClick={() =>
                        setButtonTypes(
                          carousel.buttonTypes.filter((_, idx) => idx !== i),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---- Cards ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Cards ({carousel.cards.length})
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {CAROUSEL_LIMITS.minCards}–{CAROUSEL_LIMITS.maxCards} cards. The
                number is locked once approved — sending a different count is
                rejected.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={carousel.cards.length >= CAROUSEL_LIMITS.maxCards}
              onClick={() =>
                patchCarousel({
                  cards: [
                    ...carousel.cards,
                    emptyCard(carousel.buttonTypes.length),
                  ],
                })
              }
            >
              <Plus className="size-4" />
              Add card
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {carousel.cards.map((card, index) => {
              const cardVars = extractVariableIndices(card.bodyText).length;
              const samples = Array.from(
                { length: cardVars },
                (_, i) => card.bodySamples[i] ?? '',
              );
              return (
                <div
                  key={index}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-4 text-muted-foreground/40" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Card {index + 1}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-7"
                      aria-label={`Remove card ${index + 1}`}
                      disabled={
                        carousel.cards.length <= CAROUSEL_LIMITS.minCards
                      }
                      title={
                        carousel.cards.length <= CAROUSEL_LIMITS.minCards
                          ? `A carousel needs at least ${CAROUSEL_LIMITS.minCards} cards`
                          : undefined
                      }
                      onClick={() =>
                        patchCarousel({
                          cards: carousel.cards.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`card-${index}-media`}>
                        Sample {carousel.headerFormat} URL
                      </Label>
                      <Input
                        id={`card-${index}-media`}
                        value={card.headerMediaUrl}
                        onChange={(e) =>
                          patchCard(index, { headerMediaUrl: e.target.value })
                        }
                        placeholder={`https://example.com/card${index + 1}.${
                          carousel.headerFormat === 'video' ? 'mp4' : 'jpg'
                        }`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`card-${index}-body`}>
                        Card text{' '}
                        <span className="text-muted-foreground">
                          · optional
                        </span>
                      </Label>
                      <Textarea
                        id={`card-${index}-body`}
                        rows={2}
                        value={card.bodyText}
                        onChange={(e) =>
                          patchCard(index, { bodyText: e.target.value })
                        }
                        maxLength={CAROUSEL_LIMITS.cardBodyMaxLength}
                        placeholder="Aloe Vera — easy to care for"
                        className="resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        {card.bodyText.length}/
                        {CAROUSEL_LIMITS.cardBodyMaxLength}. If any card has
                        text, every card needs it.
                      </p>
                    </div>

                    {cardVars > 0 ? (
                      <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                        {samples.map((val, i) => (
                          <Input
                            key={i}
                            value={val}
                            onChange={(e) => {
                              const next = [...samples];
                              next[i] = e.target.value;
                              patchCard(index, { bodySamples: next });
                            }}
                            placeholder={`Card ${index + 1} example for {{${i + 1}}}`}
                            aria-label={`Card ${index + 1} example value ${i + 1}`}
                          />
                        ))}
                      </div>
                    ) : null}

                    {carousel.buttonTypes.map((type, bi) => {
                      const v = card.buttonValues[bi] ?? {
                        text: '',
                        url: '',
                        example: '',
                        phone: '',
                      };
                      const update = (fields: Partial<typeof v>) =>
                        patchCard(index, {
                          buttonValues: carousel.buttonTypes.map((_, idx) =>
                            idx === bi
                              ? { ...v, ...fields }
                              : (card.buttonValues[idx] ?? {
                                  text: '',
                                  url: '',
                                  example: '',
                                  phone: '',
                                }),
                          ),
                        });
                      return (
                        <div
                          key={bi}
                          className="space-y-2 rounded-lg border border-border p-3"
                        >
                          <p className="text-xs font-semibold text-muted-foreground">
                            {BUTTON_TYPE_LABEL[type]}
                          </p>
                          <Input
                            value={v.text}
                            onChange={(e) => update({ text: e.target.value })}
                            maxLength={CAROUSEL_LIMITS.buttonTextMaxLength}
                            placeholder="Button label"
                            aria-label={`Card ${index + 1} button ${bi + 1} label`}
                          />
                          {type === 'URL' ? (
                            <>
                              <Input
                                value={v.url}
                                onChange={(e) => update({ url: e.target.value })}
                                placeholder="https://example.com/item/{{1}}"
                                aria-label={`Card ${index + 1} button ${bi + 1} URL`}
                              />
                              {extractVariableIndices(v.url).length > 0 ? (
                                <Input
                                  value={v.example}
                                  onChange={(e) =>
                                    update({ example: e.target.value })
                                  }
                                  placeholder="Example value for the URL variable"
                                  aria-label={`Card ${index + 1} button ${bi + 1} URL example`}
                                />
                              ) : null}
                            </>
                          ) : null}
                          {type === 'PHONE_NUMBER' ? (
                            <Input
                              value={v.phone}
                              onChange={(e) => update({ phone: e.target.value })}
                              placeholder="+911234567890"
                              aria-label={`Card ${index + 1} button ${bi + 1} phone`}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ---- Preview ---- */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Template preview
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Swipe the cards to check each one.
          </p>
          <WhatsAppPreview
            definition={definition}
            values={draftBodyValues({ ...draft, bodySamples })}
            className="mt-3"
          />
          {/* Cards whose text and links are fixed can be sent as soon as
              they are approved — the card media rides along from the
              sample URLs above. A variable in card text or a card link
              cannot be filled in at send time yet, so say so while the
              operator is still deciding whether to add one. */}
          {needsSendInput ? (
            <p className="mt-3 text-xs leading-relaxed text-amber-600 dark:text-amber-500">
              Because a card uses a variable, this carousel will not be
              selectable for sending yet — there is no form to fill per-card
              values in. Keep card text and links fixed and it can be sent as
              soon as Meta approves it.
            </p>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Card images are reused from the sample URLs above when you send,
              so keep them online.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
