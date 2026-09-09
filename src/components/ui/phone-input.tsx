'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Country,
  COUNTRIES,
  DEFAULT_COUNTRY,
  POPULAR_COUNTRY_CODES,
  findCountryByCode,
  parsePhoneToCountryAndNational,
  validateCountryPhoneNumber,
  ValidationResult,
} from '@/lib/phone/countries';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown, Search, Check, AlertCircle } from 'lucide-react';

export interface CountryFlagProps {
  countryCode: string;
  countryName?: string;
  className?: string;
  fallbackEmoji?: string;
}

export function CountryFlag({
  countryCode,
  countryName = '',
  className,
  fallbackEmoji,
}: CountryFlagProps) {
  const [hasError, setHasError] = useState(false);
  const code = countryCode.toLowerCase();

  if (hasError) {
    return (
      <span className={cn('text-base leading-none inline-block select-none', className)} title={countryName}>
        {fallbackEmoji || countryCode.toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt={countryName || countryCode}
      title={countryName || countryCode}
      width={20}
      height={14}
      onError={() => setHasError(true)}
      className={cn(
        'w-5 h-3.5 rounded-[2px] object-cover shrink-0 shadow-xs border border-border/80 inline-block align-middle select-none',
        className
      )}
      loading="lazy"
    />
  );
}

export interface PhoneInputProps {
  value?: string;
  onChange?: (
    fullE164: string,
    isValid: boolean,
    country: Country,
    nationalNumber: string
  ) => void;
  onBlur?: () => void;
  defaultCountryCode?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  className?: string;
  error?: string;
  showValidationMessage?: boolean;
  required?: boolean;
}

export function PhoneInput({
  value = '',
  onChange,
  onBlur,
  defaultCountryCode = 'IN',
  disabled = false,
  id,
  placeholder,
  className,
  error: externalError,
  showValidationMessage = true,
  required = false,
}: PhoneInputProps) {
  // Parse initial value or fallback to default country
  const initialParsed = useMemo(() => {
    return parsePhoneToCountryAndNational(value, defaultCountryCode);
  }, []);

  const [selectedCountry, setSelectedCountry] = useState<Country>(
    initialParsed.country
  );
  const [nationalNumber, setNationalNumber] = useState<string>(
    initialParsed.nationalNumber
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [touched, setTouched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync state if value changes externally
  useEffect(() => {
    if (value !== undefined) {
      const parsed = parsePhoneToCountryAndNational(value, selectedCountry.code);
      // Only update if digits actually changed to avoid re-triggering while typing
      const currentDigits = nationalNumber.replace(/\D/g, '');
      const incomingDigits = parsed.nationalNumber.replace(/\D/g, '');
      if (
        incomingDigits !== currentDigits ||
        parsed.country.code !== selectedCountry.code
      ) {
        setSelectedCountry(parsed.country);
        setNationalNumber(parsed.nationalNumber);
      }
    }
  }, [value]);

  // Validation logic
  const validation: ValidationResult = useMemo(() => {
    if (!nationalNumber.trim()) {
      return {
        isValid: false,
        error: required ? 'Phone number is required' : undefined,
      };
    }
    return validateCountryPhoneNumber(selectedCountry, nationalNumber);
  }, [selectedCountry, nationalNumber, required]);

  const hasError = useMemo(() => {
    if (externalError) return true;
    if (!nationalNumber.trim()) return false;
    return !validation.isValid;
  }, [externalError, nationalNumber, validation.isValid]);

  const activeErrorMessage = useMemo(() => {
    if (externalError) return externalError;
    if (hasError && (touched || nationalNumber.length > 0)) {
      return validation.error;
    }
    return undefined;
  }, [externalError, hasError, touched, nationalNumber.length, validation.error]);

  // Filter countries for dropdown search
  const filteredCountries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return COUNTRIES;

    return COUNTRIES.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(query);
      const codeMatch = c.code.toLowerCase().includes(query);
      const dialMatch = c.dialCode.includes(query) || c.dialCode.replace('+', '').includes(query);
      return nameMatch || codeMatch || dialMatch;
    });
  }, [searchQuery]);

  // Popular and All lists
  const { popularList, otherList } = useMemo(() => {
    if (searchQuery.trim()) {
      return { popularList: [], otherList: filteredCountries };
    }
    const pop = COUNTRIES.filter((c) => POPULAR_COUNTRY_CODES.includes(c.code));
    return { popularList: pop, otherList: COUNTRIES };
  }, [searchQuery, filteredCountries]);

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setPopoverOpen(false);
    setSearchQuery('');

    const newValidation = validateCountryPhoneNumber(country, nationalNumber);
    const fullE164 = nationalNumber.trim()
      ? `${country.dialCode}${nationalNumber.replace(/\D/g, '')}`
      : '';

    onChange?.(fullE164, newValidation.isValid, country, nationalNumber);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    // Allow digits, spaces, dashes, parentheses
    const cleanedDigits = rawVal.replace(/[^\d\s-()]/g, '');
    setNationalNumber(cleanedDigits);

    const digitsOnly = cleanedDigits.replace(/\D/g, '');
    const newValidation = validateCountryPhoneNumber(selectedCountry, digitsOnly);
    const fullE164 = digitsOnly ? `${selectedCountry.dialCode}${digitsOnly}` : '';

    onChange?.(fullE164, newValidation.isValid, selectedCountry, digitsOnly);
  };

  const handleBlur = () => {
    setTouched(true);
    onBlur?.();
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'flex items-center rounded-md border bg-muted text-foreground transition-all duration-150',
          hasError
            ? 'border-red-500 ring-1 ring-red-500/80 bg-red-500/5'
            : 'border-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary'
        )}
      >
        {/* Country Code Picker Dropdown */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            type="button"
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 h-9 px-3 rounded-l-md border-r border-border bg-muted/80 hover:bg-muted font-medium text-sm text-foreground transition-colors shrink-0 outline-none select-none cursor-pointer',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            aria-label={`Select country code, currently ${selectedCountry.name} (${selectedCountry.dialCode})`}
          >
            <CountryFlag
              countryCode={selectedCountry.code}
              countryName={selectedCountry.name}
              fallbackEmoji={selectedCountry.flag}
            />
            <span className="text-xs font-semibold tabular-nums text-foreground/90">
              {selectedCountry.dialCode}
            </span>
            <ChevronDown className="size-3.5 opacity-60 ml-0.5" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="w-72 p-0 bg-popover border-border text-popover-foreground shadow-lg rounded-lg overflow-hidden z-50"
          >
            {/* Search Country Input */}
            <div className="p-2 border-b border-border bg-muted/40 flex items-center gap-2">
              <Search className="size-4 text-muted-foreground shrink-0 ml-1" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search country or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-1"
                autoFocus
              />
            </div>

            {/* Scrollable Countries List */}
            <div className="max-h-60 overflow-y-auto p-1 divide-y divide-border/30">
              {popularList.length > 0 && (
                <div className="pb-1">
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Popular
                  </div>
                  {popularList.map((country) => {
                    const isSelected = country.code === selectedCountry.code;
                    return (
                      <button
                        key={`pop-${country.code}`}
                        type="button"
                        onClick={() => handleCountrySelect(country)}
                        className={cn(
                          'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm text-left transition-colors cursor-pointer',
                          isSelected
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'hover:bg-muted text-foreground'
                        )}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <CountryFlag
                            countryCode={country.code}
                            countryName={country.name}
                            fallbackEmoji={country.flag}
                          />
                          <span className="truncate">{country.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground font-mono">
                            {country.dialCode}
                          </span>
                          {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className={popularList.length > 0 ? 'pt-1' : ''}>
                {popularList.length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                    All Countries
                  </div>
                )}
                {otherList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No countries found matching "{searchQuery}"
                  </div>
                ) : (
                  otherList.map((country) => {
                    const isSelected = country.code === selectedCountry.code;
                    return (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => handleCountrySelect(country)}
                        className={cn(
                          'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm text-left transition-colors cursor-pointer',
                          isSelected
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'hover:bg-muted text-foreground'
                        )}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <CountryFlag
                            countryCode={country.code}
                            countryName={country.name}
                            fallbackEmoji={country.flag}
                          />
                          <span className="truncate">{country.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground font-mono">
                            {country.dialCode}
                          </span>
                          {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* National Phone Number Input */}
        <input
          ref={inputRef}
          id={id}
          type="tel"
          disabled={disabled}
          value={nationalNumber}
          onChange={handleNumberChange}
          onBlur={handleBlur}
          placeholder={placeholder || selectedCountry.format || '1234567890'}
          className={cn(
            'flex-1 h-9 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none font-normal',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>

      {/* Validation Error / Helper Message */}
      {showValidationMessage && activeErrorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium px-0.5 animate-in fade-in-0 duration-150">
          <AlertCircle className="size-3.5 shrink-0 text-red-400" />
          <span>{activeErrorMessage}</span>
        </div>
      )}
    </div>
  );
}
