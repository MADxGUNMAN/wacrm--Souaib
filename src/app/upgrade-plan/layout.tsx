import type { Metadata } from 'next';

// Server layout for the purchase flow. Deliberately OUTSIDE the
// (dashboard) route group: no sidebar, no header, no CRM chrome — a
// blocked owner should see a focused checkout, not a shell implying the
// app is usable.
//
// Its only real job is the noindex metadata, which a client component
// cannot export.
export const metadata: Metadata = {
  title: 'Choose your plan',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function UpgradePlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
