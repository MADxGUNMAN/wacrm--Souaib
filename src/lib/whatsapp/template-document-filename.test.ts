import { describe, expect, it } from 'vitest';
import {
  buildSendComponents,
  documentFilenameFromUrl,
  normalizeDocumentFilename,
} from './template-send-builder';
import type { MessageTemplate } from '@/types';

/*
  Document-header filenames.

  Without a `filename` on the document parameter WhatsApp labels the
  attachment "Untitled", and some clients name the saved file after the
  template's entire body text. Meta's document parameter takes the same
  media object as a plain document message — which our own
  sendMediaMessage already populates — so the template path was simply
  missing it. Reported by an integrator in Sep 2026 whose invoice PDFs
  all arrived nameless.

  The derivation matters as much as the override: almost no caller will
  pass a filename, and repeating `ORD-5074.pdf` twice in one request to
  get the obvious answer is not a reasonable ask.
*/

function row(overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    id: 't1',
    account_id: 'a1',
    name: 'order_invoice_pdf',
    language: 'en_US',
    category: 'UTILITY',
    status: 'APPROVED',
    body_text: 'Hi {{1}}, invoice {{2}} attached.',
    ...overrides,
  } as MessageTemplate;
}

/** The document object off a built header component. */
function documentOf(components: ReturnType<typeof buildSendComponents>) {
  const header = components.find((c) => c.type === 'header');
  const param = (header as { parameters: { type: string }[] }).parameters[0];
  return (param as { type: 'document'; document: Record<string, unknown> })
    .document;
}

describe('documentFilenameFromUrl', () => {
  it('takes the last path segment', () => {
    expect(
      documentFilenameFromUrl(
        'https://newidealfashionpoint.in/uploads/orders/ORD-5074.pdf'
      )
    ).toBe('ORD-5074.pdf');
  });

  it('drops a query string and fragment', () => {
    // A cache-busting `?v=2` is not part of the name the recipient saves.
    expect(documentFilenameFromUrl('https://x.test/a/ORD-1.pdf?v=2')).toBe(
      'ORD-1.pdf'
    );
    expect(documentFilenameFromUrl('https://x.test/a/ORD-1.pdf#page=2')).toBe(
      'ORD-1.pdf'
    );
    expect(
      documentFilenameFromUrl('https://x.test/a/ORD-1.pdf?v=2#page=2')
    ).toBe('ORD-1.pdf');
  });

  it('percent-decodes the segment', () => {
    expect(documentFilenameFromUrl('https://x.test/ORD%205074.pdf')).toBe(
      'ORD 5074.pdf'
    );
  });

  it('survives malformed percent-encoding instead of losing the name', () => {
    // A lone `%` throws in decodeURIComponent. Falling back to the raw
    // segment beats returning nothing.
    expect(documentFilenameFromUrl('https://x.test/100%-off.pdf')).toBe(
      '100%-off.pdf'
    );
  });

  it('returns nothing when the last segment has no extension', () => {
    // Usually a route or an id, not a file. `ORD-5074` with no `.pdf`
    // would not open by double-click, so a wrong guess is worse than
    // letting WhatsApp decide.
    expect(documentFilenameFromUrl('https://x.test/invoices/5074')).toBe('');
    expect(documentFilenameFromUrl('https://x.test/invoices/')).toBe('');
    expect(documentFilenameFromUrl('https://x.test')).toBe('');
  });

  it('returns nothing for a missing url', () => {
    expect(documentFilenameFromUrl(undefined)).toBe('');
    expect(documentFilenameFromUrl('')).toBe('');
  });
});

describe('normalizeDocumentFilename', () => {
  it('strips any directory component', () => {
    // The recipient's client may use this when saving, so a path
    // separator is at best confusing and at worst a traversal attempt.
    expect(normalizeDocumentFilename('../../etc/passwd')).toBe('passwd');
    expect(normalizeDocumentFilename('C:\\invoices\\ORD-1.pdf')).toBe(
      'ORD-1.pdf'
    );
    expect(normalizeDocumentFilename('folder/ORD-1.pdf')).toBe('ORD-1.pdf');
  });

  it('rejects values that are only path traversal', () => {
    expect(normalizeDocumentFilename('..')).toBe('');
    expect(normalizeDocumentFilename('.')).toBe('');
    expect(normalizeDocumentFilename('   ')).toBe('');
  });

  it('strips control characters', () => {
    expect(normalizeDocumentFilename('ORD\u0000-1\n.pdf')).toBe('ORD-1.pdf');
  });

  it('ignores non-strings', () => {
    expect(normalizeDocumentFilename(undefined)).toBe('');
    expect(normalizeDocumentFilename(42)).toBe('');
    expect(normalizeDocumentFilename(null)).toBe('');
  });

  it('caps the length', () => {
    expect(normalizeDocumentFilename('a'.repeat(500)).length).toBe(240);
  });
});

describe('document header filename in the built payload', () => {
  const template = row({
    header_type: 'document',
    header_media_url: 'https://x.test/default.pdf',
  });

  it('derives the filename from the send-time url', () => {
    // The exact payload the integrator reported: only headerMediaUrl,
    // no filename anywhere. It should still arrive named.
    const components = buildSendComponents(template, {
      headerMediaUrl:
        'https://newidealfashionpoint.in/uploads/orders/ORD-5074.pdf',
      body: ['Shahil Gadhawala', 'ORD-5074'],
    });

    expect(documentOf(components)).toEqual({
      link: 'https://newidealfashionpoint.in/uploads/orders/ORD-5074.pdf',
      filename: 'ORD-5074.pdf',
    });
  });

  it('prefers an explicit filename over the derived one', () => {
    const components = buildSendComponents(template, {
      headerMediaUrl: 'https://x.test/files/a1b2c3d4.pdf',
      headerDocumentFilename: 'Invoice ORD-5074.pdf',
      body: ['A', 'B'],
    });

    expect(documentOf(components)).toMatchObject({
      filename: 'Invoice ORD-5074.pdf',
    });
  });

  it('falls back to deriving when the explicit value is unusable', () => {
    const components = buildSendComponents(template, {
      headerMediaUrl: 'https://x.test/files/ORD-9.pdf',
      headerDocumentFilename: '   ',
      body: ['A', 'B'],
    });

    expect(documentOf(components)).toMatchObject({ filename: 'ORD-9.pdf' });
  });

  it('derives from the template default url when no override is sent', () => {
    const components = buildSendComponents(template, { body: ['A', 'B'] });
    expect(documentOf(components)).toEqual({
      link: 'https://x.test/default.pdf',
      filename: 'default.pdf',
    });
  });

  it('omits filename entirely when none can be determined', () => {
    // A media id carries no URL to derive from. An absent key is correct
    // here — an empty string would be sent as the visible name.
    const components = buildSendComponents(template, {
      headerMediaId: '9:realMediaId',
      body: ['A', 'B'],
    });

    const doc = documentOf(components);
    expect(doc).toEqual({ id: '9:realMediaId' });
    expect('filename' in doc).toBe(false);
  });

  it('accepts an explicit filename alongside a media id', () => {
    const components = buildSendComponents(template, {
      headerMediaId: '9:realMediaId',
      headerDocumentFilename: 'ORD-5074.pdf',
      body: ['A', 'B'],
    });

    expect(documentOf(components)).toEqual({
      id: '9:realMediaId',
      filename: 'ORD-5074.pdf',
    });
  });
});

describe('filename is document-only', () => {
  it('never appears on an image header', () => {
    // Meta rejects `filename` on an image or video parameter, so this is
    // a 400 waiting to happen rather than a cosmetic slip.
    const components = buildSendComponents(
      row({
        header_type: 'image',
        header_media_url: 'https://x.test/banner.jpg',
      }),
      { headerDocumentFilename: 'should-be-ignored.pdf', body: ['A', 'B'] }
    );

    const header = components.find((c) => c.type === 'header');
    const param = (header as { parameters: Record<string, unknown>[] })
      .parameters[0];
    expect(param).toEqual({
      type: 'image',
      image: { link: 'https://x.test/banner.jpg' },
    });
  });

  it('never appears on a video header', () => {
    const components = buildSendComponents(
      row({
        header_type: 'video',
        header_media_url: 'https://x.test/clip.mp4',
      }),
      { headerDocumentFilename: 'should-be-ignored.pdf', body: ['A', 'B'] }
    );

    const header = components.find((c) => c.type === 'header');
    const param = (header as { parameters: Record<string, unknown>[] })
      .parameters[0];
    expect(param).toEqual({
      type: 'video',
      video: { link: 'https://x.test/clip.mp4' },
    });
  });
});
