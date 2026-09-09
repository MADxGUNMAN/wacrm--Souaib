'use client';

/**
 * Upload-or-paste field for template media.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * Every template media field was a bare URL text box: to add a header
 * image you had to host the file somewhere yourself, get a public link,
 * and paste it. Meta's own WhatsApp Manager just gives you "drag and drop
 * to upload", and the gap was the single most-noticed difference between
 * the two builders.
 *
 * Pasting a link is still supported, deliberately — an operator who
 * already has the asset on their own CDN should not be forced to duplicate
 * it into our bucket — but it is now the secondary path behind a toggle
 * rather than the only one.
 *
 * ─── What it guarantees ───────────────────────────────────────────
 *
 * The file is validated against Meta's limits for the specific header
 * format BEFORE it is uploaded. Uploading first and validating later means
 * an orphan object in S3 and an error that arrives after the user has
 * moved on, which is what makes a rejected template feel like a bug in the
 * CRM rather than a file that was too big.
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { uploadAccountMedia } from '@/lib/storage/upload-media';
import {
  TEMPLATE_MEDIA_RULES,
  formatBytes,
  templateMediaFolder,
  type TemplateMediaKind,
  type TemplateMediaPurpose,
} from '@/lib/storage/media-folders';

const KIND_ICON: Record<TemplateMediaKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  document: FileText,
};

export interface MediaUploadFieldProps {
  kind: TemplateMediaKind;
  /**
   * Which S3 folder this lands in. 'review' for the sample Meta downloads
   * during approval, 'send' for media actually delivered to a customer.
   */
  purpose: TemplateMediaPurpose;
  value: string;
  onChange: (url: string) => void;
  /** Rendered under the control. Format limits are appended automatically. */
  hint?: React.ReactNode;
  /** Placeholder for the paste-a-link input. */
  urlPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Compact spacing, for the send dialog where vertical room is tight. */
  compact?: boolean;
}

export function MediaUploadField({
  kind,
  purpose,
  value,
  onChange,
  hint,
  urlPlaceholder,
  disabled = false,
  id,
  className,
  compact = false,
}: MediaUploadFieldProps) {
  const rules = TEMPLATE_MEDIA_RULES[kind];
  const Icon = KIND_ICON[kind];

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Upload progress, 0-100.
   *
   * Now that the file goes browser → S3 directly, a 100 MB PDF is a real
   * possibility rather than something nginx would have refused. A spinner
   * with no number for two minutes reads as a hang, and the natural
   * response is to click again and start a second upload.
   */
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  /**
   * Whether the paste-a-link input is showing.
   *
   * Starts open when a value is already set but did not come from our
   * bucket — editing a template that was created by pasting a URL should
   * show that URL, not an empty upload box implying the media is missing.
   */
  const [linkMode, setLinkMode] = useState(
    () => Boolean(value) && !value.includes('.amazonaws.com/')
  );

  const handleFile = useCallback(
    async (file: File) => {
      // Type first: a .mov renamed to .mp4 will still fail at Meta, but a
      // plainly wrong type is worth catching by name here.
      const accepted = rules.accept.split(',');
      if (file.type && !accepted.includes(file.type)) {
        toast.error(
          `That file is ${file.type || 'an unknown type'}. Needs ${rules.label}.`
        );
        return;
      }
      if (file.size === 0) {
        toast.error('That file is empty.');
        return;
      }
      if (file.size > rules.maxBytes) {
        toast.error(
          `That file is ${formatBytes(file.size)} — the limit for a ${kind} is ${formatBytes(rules.maxBytes)}.`
        );
        return;
      }

      setBusy(true);
      setProgress(0);
      try {
        const { publicUrl } = await uploadAccountMedia(
          templateMediaFolder(purpose),
          file,
          { onProgress: setProgress }
        );
        onChange(publicUrl);
        setLinkMode(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setBusy(false);
      }
    },
    [kind, onChange, purpose, rules]
  );

  const fileName = value
    ? decodeURIComponent(value.split('/').pop() ?? '')
    : '';
  const isImage = kind === 'image';

  return (
    <div className={cn(compact ? 'space-y-1.5' : 'space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={rules.accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the SAME file twice still fires onChange —
          // otherwise a failed upload cannot be retried without choosing a
          // different file.
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      {value && !linkMode ? (
        // ---- Something is attached ----
        <div className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border p-2">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="border-border size-12 shrink-0 rounded-md border object-cover"
              // A broken thumbnail is information: it means Meta will not be
              // able to fetch this either.
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className="bg-background border-border flex size-12 shrink-0 items-center justify-center rounded-md border">
              <Icon className="text-muted-foreground size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-xs font-medium">
              {fileName || 'Attached'}
            </p>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground truncate text-[10px] underline-offset-2 hover:underline"
            >
              Open
            </a>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled || busy}
            aria-label="Remove file"
            onClick={() => {
              // The object is deliberately NOT deleted from S3 here. For a
              // 'send' upload it may already be referenced by a delivered
              // message, and for a 'review' sample Meta may still be
              // fetching it. Orphans are handled by a lifecycle rule on the
              // prefix, not by a click that cannot know what depends on it.
              onChange('');
              setLinkMode(false);
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : linkMode ? (
        // ---- Paste a link ----
        <div className="flex items-center gap-2">
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={urlPlaceholder ?? `https://example.com/sample`}
            aria-label={`${kind} URL`}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => setLinkMode(false)}
            className="text-muted-foreground shrink-0"
          >
            <Upload className="size-3.5" />
            Upload
          </Button>
        </div>
      ) : (
        // ---- Empty: drop zone ----
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (disabled || busy) return;
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 text-center transition-colors',
            compact ? 'py-3' : 'py-5',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border bg-muted/30',
            disabled ? 'opacity-60' : ''
          )}
        >
          {busy ? (
            <>
              <Loader2 className="text-primary size-4 animate-spin" />
              <p className="text-muted-foreground text-xs">
                Uploading… {progress}%
              </p>
              <div
                className="bg-muted mt-1 h-1 w-full max-w-[180px] overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
              >
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <Upload className="text-muted-foreground size-4" />
              <p className="text-foreground text-xs">Drag and drop to upload</p>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => inputRef.current?.click()}
                  className="text-primary font-medium underline-offset-2 hover:underline disabled:opacity-50"
                >
                  choose a file
                </button>
                <span className="text-muted-foreground">or</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setLinkMode(true)}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  <Link2 className="size-3" />
                  paste a link
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <p
        className={cn(
          'text-muted-foreground',
          compact ? 'text-[10px]' : 'text-xs'
        )}
      >
        {hint ? <>{hint} </> : null}
        {rules.label}.
      </p>
    </div>
  );
}
