import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { listWhatsAppFlows } from '@/lib/whatsapp/meta-api'

/**
 * List the Meta WhatsApp Flows on this account's WABA.
 *
 * ─── Why the route is called meta-flows ───────────────────────────
 *
 * `/api/flows` already exists and serves this app's OWN flows — the
 * in-house chatbot graph in the `flows` table. These are a different
 * thing that happens to share the word: Meta's multi-screen forms, built
 * in Meta's Flow Builder, living on the WhatsApp Business Account.
 *
 * A template's FLOW button can only reference one of THESE, by Flow ID.
 * Naming this route `/api/flows/meta` or reusing the existing one would
 * invite exactly the confusion that made the template type look like it
 * was "not wired to the Flows builder yet" — it never could be.
 *
 * Read-only, and deliberately so: creating and publishing Flows means
 * Flow JSON, an endpoint URI and a connected Meta app, which is Meta's
 * builder's job. This endpoint exists so an operator who has already
 * built a Flow can attach it to a template without copying IDs by hand.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
        },
        { status: 400 },
      )
    }
    if (!config.waba_id) {
      return NextResponse.json(
        {
          error:
            'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    try {
      const flows = await listWhatsAppFlows({
        wabaId: config.waba_id,
        accessToken,
      })
      return NextResponse.json({ flows })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to list Flows.'
      // 502, not 500: the failure is upstream at Meta. A permissions
      // error here is common and specific — the Flows API needs
      // whatsapp_business_management on the token — so the message is
      // passed through rather than flattened to "something went wrong".
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
