// ============================================================
// POST /api/flows/import — create a flow from portable JSON.
//
// Always produces a DRAFT. An imported file is untrusted input that
// describes outbound customer messaging, so arriving pre-activated would
// let a pasted file start messaging real contacts before anyone read it.
//
// Never overwrites. Import means "add a flow", never "replace a flow" —
// there is no id in the payload that could target an existing row, which
// is deliberate: a format whose semantics depend on whether an id happens
// to match is a format that eventually eats somebody's work.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { parsePortableFlow } from '@/lib/flows/portable';

export const dynamic = 'force-dynamic';

/** Bound on one payload. A legitimate flow is a few KB. */
const MAX_NODES = 200;

export async function POST(request: Request) {
  // Writing a flow requires `member`; the service-role client below
  // bypasses RLS so the role has to be checked here, matching POST /api/flows.
  try {
    await requireRole('member');
  } catch (err) {
    return toErrorResponse(err);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single();
  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    document?: unknown;
    name?: string;
  } | null;
  if (!body) {
    return NextResponse.json(
      { error: 'That is not valid JSON.' },
      { status: 400 }
    );
  }

  // Accept either { document: <flow doc> } or the bare document, because
  // a user pasting a file they exported will paste the document itself.
  const rawDoc =
    body.document !== undefined ? body.document : (body as unknown);

  const parsed = parsePortableFlow(rawDoc);
  if (!parsed) {
    return NextResponse.json(
      { error: 'That JSON is not a flow export.' },
      { status: 400 }
    );
  }
  if (parsed.errors.length > 0) {
    // 422, not 400: the JSON parsed fine, it just does not describe a
    // usable flow. The full list goes back so the user can fix the file
    // instead of guessing which line was wrong.
    return NextResponse.json(
      { error: 'This flow cannot be imported.', issues: parsed.errors },
      { status: 422 }
    );
  }
  if (parsed.doc.nodes.length > MAX_NODES) {
    return NextResponse.json(
      { error: `That flow has more than ${MAX_NODES} nodes.` },
      { status: 413 }
    );
  }

  const admin = supabaseAdmin();

  /**
   * Re-resolve `set_tag` targets into THIS account's tags.
   *
   * Matched by name, because that is the only stable identifier across
   * accounts. A tag that does not exist here is created rather than left
   * dangling: the engine treats a failed tag write as non-fatal, so a
   * dangling id produces a flow that appears to work and silently tags
   * nobody — the failure mode nobody notices until a segment is empty.
   */
  const setTagNodes = parsed.doc.nodes.filter((n) => n.node_type === 'set_tag');
  const createdTags: string[] = [];
  const notes: string[] = [...parsed.warnings];

  if (setTagNodes.length > 0) {
    const wanted = [
      ...new Set(
        setTagNodes
          .map((n) => n.config.tag_name)
          .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
          .map((v) => v.trim())
      ),
    ];

    const existing = new Map<string, string>(); // lowercased name -> id
    if (wanted.length > 0) {
      const { data: tags } = await admin
        .from('tags')
        .select('id, name')
        .eq('account_id', accountId);
      for (const t of (tags ?? []) as { id: string; name: string }[]) {
        existing.set(t.name.trim().toLowerCase(), t.id);
      }
    }

    for (const node of setTagNodes) {
      const rawName = node.config.tag_name;
      const name = typeof rawName === 'string' ? rawName.trim() : '';

      if (!name) {
        // Exported before names were carried, or hand-written. The id
        // cannot be trusted across accounts, so say so rather than
        // shipping a node that silently does nothing.
        delete node.config.tag_id;
        notes.push(
          `Node "${node.node_key}" tags a contact but the file does not say which tag — pick one in the editor.`
        );
        continue;
      }

      const hit = existing.get(name.toLowerCase());
      if (hit) {
        node.config.tag_id = hit;
      } else {
        const color =
          typeof node.config.tag_color === 'string'
            ? node.config.tag_color
            : '#25D366';
        const { data: made, error: tagErr } = await admin
          .from('tags')
          .insert({
            account_id: accountId,
            user_id: user.id,
            name,
            color,
          })
          .select('id')
          .single();
        if (tagErr || !made) {
          delete node.config.tag_id;
          notes.push(
            `Could not create the tag "${name}" — set it manually on node "${node.node_key}".`
          );
        } else {
          node.config.tag_id = (made as { id: string }).id;
          existing.set(name.toLowerCase(), (made as { id: string }).id);
          createdTags.push(name);
        }
      }

      // Travel-only fields; the live config carries the id.
      delete node.config.tag_name;
      delete node.config.tag_color;
    }
  }

  // Name collision: keep the file's name but make it distinguishable.
  // Silently reusing the name leaves two identical cards in the list with
  // no way to tell which is which.
  let name = (body.name ?? parsed.doc.flow.name).trim().slice(0, 200);
  const { data: clash } = await admin
    .from('flows')
    .select('id')
    .eq('account_id', accountId)
    .eq('name', name)
    .maybeSingle();
  if (clash) {
    name = `${name} (imported)`.slice(0, 200);
    notes.push(
      `A flow called "${parsed.doc.flow.name}" already existed, so this one was renamed.`
    );
  }

  const { data: flow, error: flowErr } = await admin
    .from('flows')
    .insert({
      account_id: accountId,
      user_id: user.id,
      name,
      description: parsed.doc.flow.description,
      // Always draft — see the header.
      status: 'draft',
      trigger_type: parsed.doc.flow.trigger_type,
      trigger_config: parsed.doc.flow.trigger_config,
      entry_node_id: parsed.doc.flow.entry_node_id,
      ...(Object.keys(parsed.doc.flow.fallback_policy).length > 0
        ? { fallback_policy: parsed.doc.flow.fallback_policy }
        : {}),
    })
    .select('*')
    .single();

  if (flowErr || !flow) {
    return NextResponse.json(
      { error: flowErr?.message ?? 'Could not create the flow.' },
      { status: 500 }
    );
  }

  const flowId = (flow as { id: string }).id;

  const { error: nodesErr } = await admin.from('flow_nodes').insert(
    parsed.doc.nodes.map((n) => ({
      flow_id: flowId,
      node_key: n.node_key,
      node_type: n.node_type,
      config: n.config,
      position_x: n.position_x ?? 0,
      position_y: n.position_y ?? 0,
    }))
  );

  if (nodesErr) {
    // Roll the header back. A flow row with no nodes is a broken card the
    // user has to notice and delete by hand — the same reason the
    // template-clone path in POST /api/flows cleans up after itself.
    await admin.from('flows').delete().eq('id', flowId);
    return NextResponse.json(
      { error: `Could not import the nodes: ${nodesErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    flow,
    node_count: parsed.doc.nodes.length,
    created_tags: createdTags,
    notes,
  });
}
