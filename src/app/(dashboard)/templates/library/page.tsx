import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { LibraryTabs } from './library-tabs';

export const metadata: Metadata = {
  title: 'Template library',
};

/**
 * The template library — ours and Meta's, on one page behind tabs.
 *
 * Its own route rather than a step inside the wizard: choosing a ready-made
 * template is a different decision from writing one from scratch.
 */
export default function TemplateLibraryPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <Link
          href="/templates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Templates
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          Template library
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start from a ready-made template instead of a blank page. Pick one,
          edit anything you like, then submit it to Meta for review.
        </p>
      </div>
      <LibraryTabs />
    </div>
  );
}
