import {
  Crown,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { AccountRole } from '@/lib/auth/roles';
import type { ChipVariant } from './settings-chip';

/**
 * Single source of truth for per-role chip metadata across settings
 * surfaces (the Overview identity chip and the Members roster/invite
 * chips). Simplified to just owner and member.
 */
export const ROLE_META: Record<
  AccountRole,
  { icon: LucideIcon; label: string; variant: ChipVariant; className: string }
> = {
  owner: {
    icon: Crown,
    label: 'owner',
    variant: 'owner',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  member: {
    icon: Users,
    label: 'member',
    variant: 'muted',
    className: 'border-border bg-muted text-muted-foreground',
  },
};
