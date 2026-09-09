'use client';

import { useSyncExternalStore } from 'react';

export interface BrandSettings {
  logoUrl: string;
  logoDarkUrl: string | null;
  faviconUrl: string;
  siteName: string;
}

const STORAGE_KEY = 'replai_brand_settings';

export const DEFAULT_SETTINGS: BrandSettings = {
  logoUrl: '/Replai-logo.png',
  logoDarkUrl: null,
  faviconUrl: '/logo-icon.png',
  siteName: 'Replai',
};

// Global in-memory cache shared across all hook instances in the current window session
let memoryCache: BrandSettings | null = null;
const listeners = new Set<() => void>();

function getClientSnapshot(): BrandSettings {
  if (memoryCache) return memoryCache;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        memoryCache = {
          logoUrl:
            parsed.logoUrl || parsed.logo_url || DEFAULT_SETTINGS.logoUrl,
          logoDarkUrl: parsed.logoDarkUrl || parsed.logo_dark_url || null,
          faviconUrl:
            parsed.faviconUrl ||
            parsed.favicon_url ||
            DEFAULT_SETTINGS.faviconUrl,
          siteName:
            parsed.siteName || parsed.site_name || DEFAULT_SETTINGS.siteName,
        };
        return memoryCache;
      }
    } catch {
      // Ignore storage errors
    }
  }
  return DEFAULT_SETTINGS;
}

function getServerSnapshot(): BrandSettings {
  return DEFAULT_SETTINGS;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Trigger background fetch
  void fetchBrandingSettings();
  return () => {
    listeners.delete(callback);
  };
}

function updateCache(newSettings: BrandSettings) {
  memoryCache = newSettings;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch {
      // Ignore storage errors
    }
  }
  listeners.forEach((listener) => listener());
}

let fetchPromise: Promise<void> | null = null;

async function fetchBrandingSettings() {
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const res = await fetch('/api/public/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const settings = data.settings;
        const fresh: BrandSettings = {
          logoUrl: settings?.logo_url || DEFAULT_SETTINGS.logoUrl,
          logoDarkUrl: settings?.logo_dark_url || null,
          faviconUrl: settings?.favicon_url || DEFAULT_SETTINGS.faviconUrl,
          siteName: settings?.site_name || DEFAULT_SETTINGS.siteName,
        };
        updateCache(fresh);
      }
    } catch (err) {
      console.error('Failed to load branding settings:', err);
    } finally {
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

export function useBranding() {
  const brand = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  return {
    ...brand,
    loaded: memoryCache !== null,
  };
}
