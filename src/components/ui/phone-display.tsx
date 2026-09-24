'use client';

import React, { useState } from 'react';
import {
  formatPhoneNumberParts,
  formatPhoneNumber,
  type FormattedPhoneParts,
} from '@/lib/phone/countries';
import { CountryFlag } from '@/components/ui/phone-input';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface PhoneDisplayProps {
  phone: string | null | undefined;
  className?: string;
  defaultCountryCode?: string;
  showFlag?: boolean;
  copyable?: boolean;
  emptyPlaceholder?: string;
}

export function PhoneDisplay({
  phone,
  className,
  defaultCountryCode = 'IN',
  showFlag = false,
  copyable = false,
  emptyPlaceholder = '—',
}: PhoneDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!phone || !phone.trim()) {
    return (
      <span className={cn('text-muted-foreground/50 text-xs', className)}>
        {emptyPlaceholder}
      </span>
    );
  }

  const parts: FormattedPhoneParts = formatPhoneNumberParts(
    phone,
    defaultCountryCode
  );

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = parts.formatted || phone;
    navigator.clipboard.writeText(textToCopy).then(
      () => {
        setCopied(true);
        toast.success('Phone copied to clipboard');
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        toast.error('Failed to copy');
      }
    );
  };

  const tooltip = parts.country
    ? `${parts.country.name} (${parts.country.dialCode})`
    : parts.formatted;

  return (
    <span
      className={cn(
        'group/phone inline-flex items-center font-mono text-xs tabular-nums',
        className
      )}
      title={tooltip}
    >
      {showFlag && parts.country && (
        <CountryFlag
          countryCode={parts.country.code}
          countryName={parts.country.name}
          className="mr-1.5 shrink-0"
        />
      )}
      {parts.dialCode ? (
        <>
          <span className="text-muted-foreground/80 font-medium select-all">
            {parts.dialCode}
          </span>
          <span className="select-all">&nbsp;</span>
          <span className="text-foreground font-medium tracking-tight select-all">
            {parts.nationalNumber}
          </span>
        </>
      ) : (
        <span className="text-foreground font-medium select-all">
          {parts.formatted || phone}
        </span>
      )}
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-muted-foreground/60 hover:text-foreground hover:bg-muted ml-1.5 inline-flex size-5 cursor-pointer items-center justify-center rounded opacity-0 transition-all group-hover:opacity-100 group-hover/phone:opacity-100"
          title="Copy phone number"
          aria-label="Copy phone number"
        >
          {copied ? (
            <Check className="text-primary size-3" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      )}
    </span>
  );
}

export { formatPhoneNumber, formatPhoneNumberParts };
