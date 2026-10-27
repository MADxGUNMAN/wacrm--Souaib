'use client';

// "How to connect" — Replai can't push a connection into Claude or
// ChatGPT, so the user starts it in the AI app. While this dialog is open
// the parent polls every 5 s, so the card flips to Connected as soon as
// the browser sign-in completes (04 §4.1).
//
// Two shapes:
// - Listed platform (`listingUrl` set): the official directory page was
//   already opened in a new tab by the Connect button; this dialog only
//   says what to click there and waits.
// - Not listed here (Claude while in review, or ChatGPT on dev, where the
//   published plugin would point at production): manual custom-connector
//   steps with the server URL.

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PLATFORM_NAMES,
  listingIsRemote,
  type PrimaryPlatform,
} from './shared';

const STEPS: Record<PrimaryPlatform, string[]> = {
  claude: [
    'In Claude, open Settings → Connectors.',
    'Choose "Add custom connector", name it Replai and paste the URL below.',
    'Click Connect. A Replai window opens: sign in and click Allow.',
  ],
  chatgpt: [
    'In ChatGPT, open Settings → Apps and turn on Developer mode under Advanced settings.',
    'Create an app, name it Replai, paste the URL below and choose OAuth sign-in.',
    'Click Connect. A Replai window opens: sign in and click Allow.',
  ],
};

const LISTED_STEPS: Record<PrimaryPlatform, string[]> = {
  claude: [
    'On the Replai page in Claude, click Connect.',
    'A Replai window opens: sign in and click Allow.',
  ],
  chatgpt: [
    'On the Replai plugin page in ChatGPT, click Connect.',
    'A Replai window opens: sign in, choose what ChatGPT may do and click Allow.',
  ],
};

export function ConnectGuideDialog({
  platform,
  mcpUrl,
  listingUrl,
  open,
  onOpenChange,
}: {
  platform: PrimaryPlatform;
  mcpUrl: string;
  /** Official directory page; when set, the manual steps are not shown. */
  listingUrl?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  // On devcrm / local the plugin connects through production; let the
  // user switch to the manual developer-mode steps instead.
  const [showManual, setShowManual] = useState(false);
  const remote = listingIsRemote(platform, mcpUrl);
  const name = PLATFORM_NAMES[platform];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (listingUrl && !showManual) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-popover border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect {name} to Replai</DialogTitle>
            <DialogDescription>
              Replai is in the official {name} directory. We opened it in a new
              tab. This window updates by itself when you&rsquo;re connected.
            </DialogDescription>
          </DialogHeader>

          <ol className="text-foreground list-decimal space-y-2 pl-5 text-sm">
            {LISTED_STEPS[platform].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <p className="text-muted-foreground text-xs">
            If no tab opened, your browser may have blocked it. Use the button
            below.
          </p>

          {remote ? (
            <p className="text-muted-foreground border-border bg-muted/40 rounded-md border px-3 py-2 text-xs">
              The published plugin connects through the production server. Your
              workspace data is the same, so the connection still appears here.{' '}
              <button
                type="button"
                onClick={() => setShowManual(true)}
                className="text-primary font-medium underline underline-offset-2"
              >
                Use developer mode instead
              </button>
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <a
              href={listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'default' })}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="ml-1">Open Replai in {name}</span>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect {name} to Replai</DialogTitle>
          <DialogDescription>
            You start the connection in {name}. This window updates by itself
            when it&rsquo;s done.
          </DialogDescription>
        </DialogHeader>

        <ol className="text-foreground list-decimal space-y-2 pl-5 text-sm">
          {STEPS[platform].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="mt-2">
          <label
            htmlFor="ai-mcp-url"
            className="text-muted-foreground text-xs font-medium"
          >
            Replai connector URL
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="ai-mcp-url"
              readOnly
              value={mcpUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="border-border bg-muted/40 text-foreground h-9 min-w-0 flex-1 rounded-md border px-3 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copy}
              className="h-9 shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Menu names can differ slightly between {name} versions.
          {platform === 'claude'
            ? ' Replai is in review for the Claude directory; once it is listed you will be able to add it in one click.'
            : ' These steps connect ChatGPT to this server directly.'}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
