/**
 * WhatsApp account insights.
 *
 * A route rather than a dialog: this is a dashboard, not a detail popup —
 * it is read side by side with the templates and broadcasts it describes,
 * and it needs to survive a refresh and be linkable in a message to a
 * colleague. `/settings/...` is prefix-matched by the proxy's
 * `protectedPaths`, so auth and subscription gating come for free.
 *
 * A thin container by design: the heading and every control live in the
 * client component, so there is no second <h1> to drift out of step with
 * it (the same duplicate-heading mistake that was fixed on /templates).
 */

import { WhatsAppInsights } from '@/components/settings/whatsapp-insights';

export const metadata = {
  title: 'WhatsApp insights',
};

export default function WhatsAppInsightsPage() {
  return <WhatsAppInsights />;
}
