// ============================================================
// The channel of a billing event or payment, as one badge: icon, words
// and colour from CHANNEL_META, the same on every billing screen. The
// icon and colour only reinforce the text; the label is always shown.
// ============================================================

import { Cog, QrCode, Repeat, User, UserCog } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { BillingChannel } from '@/lib/billing/event-channel';
import { cn } from '@/lib/utils';
import { CHANNEL_META, TONE_BADGE_CLASS } from './billing-labels';

const CHANNEL_ICON: Readonly<Record<BillingChannel, React.ElementType>> = {
  razorpay: Repeat,
  manual_upi: QrCode,
  admin: UserCog,
  customer: User,
  system: Cog,
};

export function ChannelBadge({
  channel,
  size = 'md',
  label,
  className,
}: {
  channel: BillingChannel;
  size?: 'sm' | 'md';
  /** Shorter wording for tight tables; the full name stays in the tooltip. */
  label?: string;
  className?: string;
}) {
  const meta = CHANNEL_META[channel];
  const Icon = CHANNEL_ICON[channel];
  return (
    <Badge
      variant="outline"
      title={meta.hint}
      aria-label={`Channel: ${meta.label}`}
      className={cn(
        'gap-1 font-semibold whitespace-nowrap',
        size === 'sm'
          ? 'h-auto px-1.5 py-0.5 text-[10px] leading-none'
          : 'text-[11px]',
        TONE_BADGE_CLASS[meta.tone],
        className
      )}
    >
      <Icon className={size === 'sm' ? 'size-2.5' : 'size-3'} aria-hidden />
      {label ?? meta.label}
    </Badge>
  );
}
