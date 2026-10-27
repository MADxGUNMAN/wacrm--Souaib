import { boldSegments } from '@/lib/cms/content-helpers';

/**
 * Renders CMS copy with "**bold**" markers as <strong>. Plain text only:
 * no HTML is ever interpreted, so super-admin copy can't inject markup.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {boldSegments(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : seg.text
      )}
    </>
  );
}
