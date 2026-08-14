import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the Meta resumable upload so the helper is tested in isolation.
vi.mock('./meta-api', () => ({
  uploadResumableMedia: vi.fn(async () => ({ handle: 'HANDLE123' })),
}));

import { ensureMediaHeaderHandle } from './template-header-handle';
import { uploadResumableMedia } from './meta-api';
import type { TemplatePayload } from './template-validators';

function payload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 't',
    category: 'Utility',
    language: 'en_US',
    body_text: 'hi',
    header_type: 'image',
    header_media_url: 'https://x.test/img.jpg',
    ...over,
  };
}

function mediaResponse(
  type = 'image/jpeg',
  size = 1024,
  ok = true,
  status = 200,
): Response {
  return {
    ok,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: async () => new ArrayBuffer(size),
  } as unknown as Response;
}

describe('ensureMediaHeaderHandle', () => {
  beforeEach(() => {
    vi.mocked(uploadResumableMedia).mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is a no-op for text headers', async () => {
    const p = payload({ header_type: 'text', header_content: 'Hi' });
    await ensureMediaHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).not.toHaveBeenCalled();
    expect(p.header_handle).toBeUndefined();
  });

  it('is a no-op when there is no header at all', async () => {
    const p = payload({ header_type: undefined, header_media_url: undefined });
    await ensureMediaHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).not.toHaveBeenCalled();
  });

  it('is a no-op when a handle already exists', async () => {
    const p = payload({ header_handle: 'existing' });
    await ensureMediaHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).not.toHaveBeenCalled();
    expect(p.header_handle).toBe('existing');
  });

  it('throws an actionable error when NEITHER app-id name is set', async () => {
    const p = payload();
    await expect(ensureMediaHeaderHandle(p, 'tok')).rejects.toThrow(
      /Meta App ID/,
    );
    // Names the variable to set, since the failure happens in a deployment
    // where you cannot attach a debugger.
    await expect(ensureMediaHeaderHandle(p, 'tok')).rejects.toThrow(
      /NEXT_PUBLIC_META_APP_ID/,
    );
  });

  /**
   * The app ID has been read under two names in this project:
   * `NEXT_PUBLIC_META_APP_ID` by embedded signup (which needs it in the
   * browser) and a server-only `META_APP_ID` here. Nobody sets both, so a
   * media-header template failed with "need META_APP_ID set" on an
   * environment where the app ID was sitting in the same file under the
   * other name. Both are accepted; an App ID is public by definition, so
   * there was never a reason for two.
   */
  it('accepts the public app-id name as a fallback', async () => {
    vi.stubEnv('NEXT_PUBLIC_META_APP_ID', 'app-public');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('image/jpeg', 2048)));
    const p = payload();
    await ensureMediaHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'app-public' }),
    );
  });

  it('prefers the server-only name when both are set', async () => {
    vi.stubEnv('META_APP_ID', 'app-server');
    vi.stubEnv('NEXT_PUBLIC_META_APP_ID', 'app-public');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('image/jpeg', 2048)));
    await ensureMediaHeaderHandle(payload(), 'tok');
    expect(uploadResumableMedia).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'app-server' }),
    );
  });

  it('derives + sets header_handle from a valid image URL', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('image/jpeg', 2048)));
    const p = payload();
    await ensureMediaHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).toHaveBeenCalledOnce();
    expect(p.header_handle).toBe('HANDLE123');
  });

  it('rejects a non-image content type for an image header', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('text/html')));
    await expect(ensureMediaHeaderHandle(payload(), 'tok')).rejects.toThrow(
      /JPEG or PNG/,
    );
  });

  it('rejects an image over 5 MB', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('image/png', 6 * 1024 * 1024)));
    await expect(ensureMediaHeaderHandle(payload(), 'tok')).rejects.toThrow(/5 MB/);
  });

  // ---- video ----
  // These used to fall through to example.header_url, which Meta rejects
  // at creation, so a video-header template could never be created.

  it('derives a handle for a video header', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('video/mp4', 4096)));
    const p = payload({
      header_type: 'video',
      header_media_url: 'https://x.test/clip.mp4',
    });
    await ensureMediaHeaderHandle(p, 'tok');
    expect(uploadResumableMedia).toHaveBeenCalledOnce();
    expect(vi.mocked(uploadResumableMedia).mock.calls[0][0]).toMatchObject({
      mimeType: 'video/mp4',
      fileName: 'header.mp4',
    });
    expect(p.header_handle).toBe('HANDLE123');
  });

  it('rejects a video over 16 MB', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mediaResponse('video/mp4', 17 * 1024 * 1024)),
    );
    const p = payload({
      header_type: 'video',
      header_media_url: 'https://x.test/clip.mp4',
    });
    await expect(ensureMediaHeaderHandle(p, 'tok')).rejects.toThrow(/16 MB/);
  });

  it('rejects a non-video content type for a video header', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('image/png')));
    const p = payload({
      header_type: 'video',
      header_media_url: 'https://x.test/clip.mp4',
    });
    await expect(ensureMediaHeaderHandle(p, 'tok')).rejects.toThrow(/MP4 or 3GPP/);
  });

  // ---- document ----

  it('derives a handle for a document header', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('application/pdf', 8192)));
    const p = payload({
      header_type: 'document',
      header_media_url: 'https://x.test/receipt.pdf',
    });
    await ensureMediaHeaderHandle(p, 'tok');
    expect(vi.mocked(uploadResumableMedia).mock.calls[0][0]).toMatchObject({
      mimeType: 'application/pdf',
      fileName: 'header.pdf',
    });
    expect(p.header_handle).toBe('HANDLE123');
  });

  it('rejects a non-PDF document header', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('application/msword')));
    const p = payload({
      header_type: 'document',
      header_media_url: 'https://x.test/doc.docx',
    });
    await expect(ensureMediaHeaderHandle(p, 'tok')).rejects.toThrow(/PDF/);
  });

  // ---- shared edge cases ----

  it('tolerates a missing content-type header and falls back by format', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('', 2048)));
    const p = payload({
      header_type: 'video',
      header_media_url: 'https://x.test/clip.mp4',
    });
    await ensureMediaHeaderHandle(p, 'tok');
    expect(vi.mocked(uploadResumableMedia).mock.calls[0][0]).toMatchObject({
      mimeType: 'video/mp4',
    });
  });

  it('rejects an empty body', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('image/jpeg', 0)));
    await expect(ensureMediaHeaderHandle(payload(), 'tok')).rejects.toThrow(/empty/);
  });

  it('reports an unreachable URL by status', async () => {
    vi.stubEnv('META_APP_ID', 'app-1');
    vi.stubGlobal('fetch', vi.fn(async () => mediaResponse('image/jpeg', 10, false, 404)));
    await expect(ensureMediaHeaderHandle(payload(), 'tok')).rejects.toThrow(/404/);
  });
});
