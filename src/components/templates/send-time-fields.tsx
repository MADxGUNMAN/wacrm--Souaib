"use client";

/**
 * The send-time inputs that are IDENTICAL wherever a template is sent:
 * a limited-time offer's expiry, and a carousel's per-card values.
 *
 * The inbox picker and the broadcast personalize step both need these.
 * Their BODY variable inputs legitimately differ — the broadcast step
 * maps each variable to a contact field rather than a literal, because it
 * sends to thousands of people — but an offer expiry and a card's image
 * link are the same input in both places, and writing them twice is how
 * they end up validating differently.
 *
 * Everything here is driven by `TemplateSendPlan`, so a card that gains a
 * variable gains an input with no change on this side.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Clock,
  Image as ImageIcon,
  MapPin,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";
import { MPM_LIMITS } from "@/lib/whatsapp/template-limits";
import {
  ORDER_STATUS_OPTIONS,
  localInputToMs,
  orderDetailsTotal,
  type MpmValues,
  type OrderDetailsValues,
  type CardSendPlan,
  type CardValues,
  type HeaderLocationValues,
  type OfferSendPlan,
  type OrderStatusOption,
  type TemplateSendPlan,
} from "@/lib/whatsapp/template-send-inputs";

// ============================================================
// Offer expiry
// ============================================================

export function OfferExpiryField({
  offer,
  value,
  onChange,
  code,
  onCodeChange,
}: {
  offer: OfferSendPlan;
  /** The datetime-local string, not ms. */
  value: string;
  onChange: (next: string) => void;
  /** The offer code override. Empty means "use the approved one". */
  code: string;
  onCodeChange: (next: string) => void;
}) {
  // A clock in state rather than `Date.now()` during render. Reading the
  // clock while rendering is impure, and here it is also wrong: a deadline
  // set a few minutes out passes while the operator is still filling in
  // the form, and the warning has to appear when that happens rather than
  // only on the next keystroke.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const ms = localInputToMs(value);
  const inPast = ms !== undefined && ms <= now;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-medium text-popover-foreground">
          {offer.text || "Limited-time offer"}
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">
          Offer expires at
        </Label>
        <Input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-border bg-muted text-foreground"
        />
        <p className="text-[10px] text-muted-foreground">
          {offer.hasExpiration
            ? "The customer sees a live countdown to this moment, in their own timezone."
            : "Required even without a countdown — the offer code stops working after this."}
        </p>
        {inPast ? (
          <p className="text-[10px] text-amber-600 dark:text-amber-500">
            That time has already passed. The customer would receive an offer
            that is dead on arrival.
          </p>
        ) : null}
      </div>

      {offer.code ? (
        <div className="space-y-1">
          <Label className="text-xs text-popover-foreground">
            {`Code for the "${offer.code.text}" button`}
          </Label>
          <Input
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder={offer.code.defaultCode || "e.g. SAVE20"}
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
          <p className="text-[10px] text-muted-foreground">
            {offer.code.defaultCode
              ? `Leave blank to use the approved code "${offer.code.defaultCode}".`
              : "This template has no default code, so one is required."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// Location header
// ============================================================

export function HeaderLocationFields({
  value,
  onChange,
}: {
  value: HeaderLocationValues;
  onChange: (next: HeaderLocationValues) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-medium text-popover-foreground">
          The map pin for this message
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-popover-foreground">Latitude</Label>
          <Input
            value={value.latitude}
            onChange={(e) => onChange({ ...value, latitude: e.target.value })}
            inputMode="decimal"
            placeholder="18.5204"
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-popover-foreground">Longitude</Label>
          <Input
            value={value.longitude}
            onChange={(e) => onChange({ ...value, longitude: e.target.value })}
            inputMode="decimal"
            placeholder="73.8567"
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">Place name</Label>
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Replai HQ"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">Address</Label>
        <Input
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="FC Road, Pune 411005"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        All four are required — WhatsApp draws the pin from the coordinates and
        labels it with the name and address, and refuses a partial pin.
      </p>
    </div>
  );
}

// ============================================================
// Order status
// ============================================================

export function OrderStatusFields({
  referenceId,
  status,
  description,
  onChange,
}: {
  referenceId: string;
  status: string;
  description: string;
  onChange: (patch: {
    orderReferenceId?: string;
    orderStatus?: OrderStatusOption | '';
    orderStatusDescription?: string;
  }) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <PackageCheck className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-medium text-popover-foreground">
          Which order is this updating?
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">
          Order reference id
        </Label>
        <Input
          value={referenceId}
          onChange={(e) => onChange({ orderReferenceId: e.target.value })}
          placeholder="The reference id from the order message"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
        <p className="text-[10px] text-muted-foreground">
          Comes from the order message that created the order. Without it
          WhatsApp has no order to update.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">New status</Label>
        {/* A plain select rather than the styled one: this component is
            rendered inside both a dialog and a page, and the native
            element behaves correctly in both without extra portal work. */}
        <select
          value={status}
          onChange={(e) =>
            onChange({ orderStatus: e.target.value as OrderStatusOption | '' })
          }
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
        >
          <option value="">Choose a status…</option>
          {ORDER_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground">
          WhatsApp checks the transition makes sense — it refuses to move an
          order backwards, or to cancel one that is already paid.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">
          Note on the order card · optional
        </Label>
        <Input
          value={description}
          onChange={(e) => onChange({ orderStatusDescription: e.target.value })}
          placeholder="e.g. Left with the neighbour"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

// ============================================================
// Commerce: catalogue thumbnail, MPM products, order invoice
// ============================================================

export function CatalogThumbnailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3">
      <Label className="text-xs text-popover-foreground">
        Header product · optional
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Content ID / SKU from Commerce Manager"
        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
      />
      <p className="text-[10px] text-muted-foreground">
        This product&apos;s image becomes the header. Leave blank and WhatsApp
        uses the first item in your catalogue.
      </p>
    </div>
  );
}

export function MpmFields({
  value,
  onChange,
}: {
  value: MpmValues;
  onChange: (next: MpmValues) => void;
}) {
  const productCount = value.sections.reduce(
    (n, s) => n + s.productIds.split(/[\s,]+/).filter(Boolean).length,
    0,
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-medium text-popover-foreground">
          Which products to show
        </p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {productCount}/{MPM_LIMITS.maxProductsTotal} products
        </span>
      </div>

      {value.sections.map((section, i) => (
        <div key={i} className="space-y-1 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <Input
              value={section.title}
              onChange={(e) => {
                const sections = [...value.sections];
                sections[i] = { ...section, title: e.target.value };
                onChange({ ...value, sections });
              }}
              maxLength={MPM_LIMITS.sectionTitleMaxLength}
              placeholder={`Section ${i + 1} title, e.g. Best sellers`}
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
            {value.sections.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    sections: value.sections.filter((_, idx) => idx !== i),
                  })
                }
                className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              >
                Remove
              </button>
            ) : null}
          </div>
          <Input
            value={section.productIds}
            onChange={(e) => {
              const sections = [...value.sections];
              sections[i] = { ...section, productIds: e.target.value };
              onChange({ ...value, sections });
            }}
            placeholder="Product IDs, separated by commas"
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>
      ))}

      {value.sections.length < MPM_LIMITS.maxSections ? (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              sections: [...value.sections, { title: '', productIds: '' }],
            })
          }
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Add section
        </button>
      ) : null}

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">
          Header product · optional
        </Label>
        <Input
          value={value.thumbnailProductId}
          onChange={(e) =>
            onChange({ ...value, thumbnailProductId: e.target.value })
          }
          placeholder="Content ID / SKU"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        The IDs are the Content IDs from Meta Commerce Manager. Up to{' '}
        {MPM_LIMITS.maxSections} sections and {MPM_LIMITS.maxProductsTotal}{' '}
        products in total.
      </p>
    </div>
  );
}

export function OrderDetailsFields({
  value,
  onChange,
}: {
  value: OrderDetailsValues;
  onChange: (next: OrderDetailsValues) => void;
}) {
  const total = orderDetailsTotal(value);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <ReceiptText className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-medium text-popover-foreground">
          The invoice to send
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-popover-foreground">
            Your order reference
          </Label>
          <Input
            value={value.referenceId}
            onChange={(e) => onChange({ ...value, referenceId: e.target.value })}
            placeholder="ORD-1042"
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-popover-foreground">Currency</Label>
          <Input
            value={value.currency}
            onChange={(e) =>
              onChange({ ...value, currency: e.target.value.toUpperCase() })
            }
            maxLength={3}
            placeholder="INR"
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-popover-foreground">Items</Label>
        {value.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item.name}
              onChange={(e) => {
                const items = [...value.items];
                items[i] = { ...item, name: e.target.value };
                onChange({ ...value, items });
              }}
              placeholder="Item name"
              className="flex-1 border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
            <Input
              value={item.amount}
              onChange={(e) => {
                const items = [...value.items];
                items[i] = { ...item, amount: e.target.value };
                onChange({ ...value, items });
              }}
              inputMode="decimal"
              placeholder="Price"
              className="w-24 border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
            <Input
              value={item.quantity}
              onChange={(e) => {
                const items = [...value.items];
                items[i] = { ...item, quantity: e.target.value.replace(/\D/g, '') };
                onChange({ ...value, items });
              }}
              inputMode="numeric"
              placeholder="Qty"
              className="w-16 border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
            {value.items.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    items: value.items.filter((_, idx) => idx !== i),
                  })
                }
                className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              items: [
                ...value.items,
                { name: '', amount: '', quantity: '1', retailerId: '' },
              ],
            })
          }
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Add item
        </button>
        <p className="text-[10px] text-muted-foreground">
          Prices in whole {value.currency || 'INR'} — e.g. 250 for ₹250. Paise
          are handled for you.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['taxAmount', 'Tax'],
            ['shippingAmount', 'Shipping'],
            ['discountAmount', 'Discount'],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="space-y-1">
            <Label className="text-xs text-popover-foreground">{label}</Label>
            <Input
              value={value[field]}
              onChange={(e) => onChange({ ...value, [field]: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-popover-foreground">
          Payment configuration name
        </Label>
        <Input
          value={value.paymentConfiguration}
          onChange={(e) =>
            onChange({ ...value, paymentConfiguration: e.target.value })
          }
          placeholder="From WhatsApp Manager → Payments"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
        <p className="text-[10px] text-muted-foreground">
          Without this the invoice shows but has no payment gateway behind it,
          so the customer cannot pay.
        </p>
      </div>

      <p className="text-xs font-medium text-popover-foreground">
        Total: {value.currency || 'INR'} {total.toFixed(2)}
      </p>
    </div>
  );
}

// ============================================================
// Carousel cards
// ============================================================

export function CarouselCardFields({
  cards,
  values,
  onChange,
}: {
  cards: CardSendPlan[];
  /** Indexed by cardIndex, sparse. */
  values: CardValues[];
  onChange: (cardIndex: number, patch: CardValues) => void;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-popover-foreground">
        {`Card details (${cards.length} cards)`}
      </p>
      {/* Card count and order are frozen at approval, so this list is
          fixed — there is nothing to add or remove here, only fill in. */}
      {cards.map((card) => {
        const given = values[card.cardIndex] ?? {};
        return (
          <div
            key={card.cardIndex}
            className="space-y-2 rounded-lg border border-border bg-muted/40 p-3"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-medium text-popover-foreground">
                {`Card ${card.cardIndex + 1}`}
              </p>
            </div>
            {card.bodyText ? (
              <p className="line-clamp-2 text-[10px] text-muted-foreground">
                {card.bodyText}
              </p>
            ) : null}

            <div className="space-y-1">
              <Label className="text-xs text-popover-foreground">
                {`${card.media.format.charAt(0)}${card.media.format
                  .slice(1)
                  .toLowerCase()} link`}
              </Label>
              <Input
                value={given.headerMediaUrl ?? ""}
                onChange={(e) =>
                  onChange(card.cardIndex, { headerMediaUrl: e.target.value })
                }
                placeholder={
                  card.media.defaultUrl || "https://example.com/card.png"
                }
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-[10px] text-muted-foreground">
                {card.media.defaultUrl
                  ? "Leave blank to use the image approved with the template."
                  : "This card has no stored image, so a link is required."}
              </p>
            </div>

            {Array.from({ length: card.bodyVarCount }, (_, i) => (
              <div key={i} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`Card text {{${i + 1}}}`}
                </Label>
                <Input
                  value={given.body?.[i] ?? ""}
                  onChange={(e) => {
                    const next = [...(given.body ?? [])];
                    next[i] = e.target.value;
                    onChange(card.cardIndex, { body: next });
                  }}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}

            {card.urlButtons.map((btn) => (
              <div key={btn.index} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`Link value for "${btn.text}"`}
                </Label>
                <Input
                  value={given.buttonParams?.[btn.index] ?? ""}
                  onChange={(e) =>
                    onChange(card.cardIndex, {
                      buttonParams: {
                        ...(given.buttonParams ?? {}),
                        [btn.index]: e.target.value,
                      },
                    })
                  }
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="break-words text-[10px] text-muted-foreground">
                  {btn.url.replace(
                    /\{\{1\}\}/g,
                    given.buttonParams?.[btn.index] || "{{1}}",
                  )}
                </p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** True when the plan has anything for these shared fields to render. */
export function hasSharedSendFields(plan: TemplateSendPlan): boolean {
  return (
    plan.offer !== null ||
    plan.cards.length > 0 ||
    plan.isOrderStatus ||
    plan.needsHeaderLocation
  );
}
