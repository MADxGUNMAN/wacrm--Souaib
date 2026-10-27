import { describe, expect, it } from 'vitest';
import {
  clientIp,
  countryForTimezone,
  countryName,
  headerCountry,
  normalizeTimezone,
  parseUserAgent,
  requestDeviceMeta,
} from './device';

const UA = {
  winChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

describe('parseUserAgent', () => {
  it('recognises common desktop and mobile browsers', () => {
    expect(parseUserAgent(UA.winChrome)).toEqual({
      platform: 'Windows',
      device_type: 'Desktop',
      browser: 'Chrome',
      browser_version: '141',
    });
    expect(parseUserAgent(UA.macSafari)).toMatchObject({
      platform: 'macOS',
      device_type: 'Desktop',
      browser: 'Safari',
    });
    expect(parseUserAgent(UA.iphone)).toMatchObject({
      platform: 'iOS',
      device_type: 'Mobile',
      browser: 'Safari',
    });
    expect(parseUserAgent(UA.android)).toMatchObject({
      platform: 'Android',
      device_type: 'Mobile',
      browser: 'Chrome',
    });
    expect(parseUserAgent(UA.ipad)).toMatchObject({ device_type: 'Tablet' });
  });

  it('shortens Microsoft Edge', () => {
    expect(parseUserAgent(UA.edge).browser).toBe('Edge');
  });

  it('handles missing or junk user agents', () => {
    expect(parseUserAgent(null)).toEqual({
      platform: null,
      device_type: 'Unknown',
      browser: null,
      browser_version: null,
    });
    expect(parseUserAgent('curl/8.0').device_type).toBeTruthy();
  });
});

describe('timezone and country', () => {
  it('accepts real IANA zones only', () => {
    expect(normalizeTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(normalizeTimezone('Not/AZone')).toBeNull();
    expect(normalizeTimezone('<script>')).toBeNull();
    expect(normalizeTimezone(42)).toBeNull();
    expect(normalizeTimezone('x'.repeat(80))).toBeNull();
  });

  it('maps a timezone to its country', () => {
    expect(countryForTimezone('Asia/Kolkata')).toBe('IN');
    expect(countryForTimezone('Europe/London')).toBe('GB');
    expect(countryForTimezone(null)).toBeNull();
    expect(countryName('IN')).toBe('India');
    expect(countryName(null)).toBeNull();
  });

  it('prefers a trusted geo header and ignores unknown/Tor codes', () => {
    expect(headerCountry(new Headers({ 'cf-ipcountry': 'in' }))).toBe('IN');
    expect(headerCountry(new Headers({ 'cf-ipcountry': 'XX' }))).toBeNull();
    expect(headerCountry(new Headers({ 'cf-ipcountry': 'T1' }))).toBeNull();
    expect(headerCountry(new Headers({ 'x-country-code': 'GBR' }))).toBeNull();
  });
});

describe('clientIp', () => {
  it('reads proxy headers in priority order and rejects junk', () => {
    expect(
      clientIp(
        new Headers({
          'x-real-ip': '27.54.191.65',
          'x-forwarded-for': '1.1.1.1',
        })
      )
    ).toBe('27.54.191.65');
    expect(
      clientIp(new Headers({ 'x-forwarded-for': '2001:db8::1, 10.0.0.1' }))
    ).toBe('2001:db8::1');
    expect(clientIp(new Headers({ 'x-real-ip': 'evil<script>' }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('requestDeviceMeta', () => {
  it('combines UA, IP, timezone and derived country', () => {
    const meta = requestDeviceMeta(
      new Headers({ 'user-agent': UA.winChrome, 'x-real-ip': '27.54.191.65' }),
      'Asia/Kolkata'
    );
    expect(meta).toMatchObject({
      ip: '27.54.191.65',
      platform: 'Windows',
      browser: 'Chrome',
      timezone: 'Asia/Kolkata',
      country_code: 'IN',
    });
  });
});
