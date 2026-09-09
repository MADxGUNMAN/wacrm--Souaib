// ============================================================
// GET /api/flows/[id]/export — download a flow as portable JSON.
//
// Ownership is enforced through the RLS-scoped client, exactly as the
// sibling [id] routes do: a flow belonging to another account reads back
// as null and this returns 404 rather than confirming it exists.
//
// Read-only, so `member` is not required — anyone who can open the flow
// can take a copy of it.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  portableFlowFilename,
  toPortableFlow,
  type ExportSourceNode,
} from '@/lib/flows/portable';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [{ data: flow }, { data: nodes }] = await Promise.all([
    supabase.from('flows').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('flow_nodes')
      .select('*')
      .eq('flow_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (!flow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const nodeRows = (nodes ?? []) as ExportSourceNode[];

  /**
   * Resolve tag ids to names so `set_tag` survives the trip.
   *
   * Without this the importing account gets a tag_id pointing at a row it
   * cannot see, and the engine treats a failed tag write as non-fatal —
   * so the flow would run to completion while quietly tagging nobody.
   */
  const tagIds = [
    ...new Set(
      nodeRows
        .filter((n) => n.node_type === 'set_tag')
        .map((n) => (n.config as { tag_id?: unknown } | null)?.tag_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    ),
  ];

  const tagNames = new Map<string, { name: string; color?: string | null }>();
  if (tagIds.length > 0) {
    // RLS-scoped: only tags this caller can see, which is the same
    // account the flow belongs to.
    const { data: tags } = await supabase
      .from('tags')
      .select('id, name, color')
      .in('id', tagIds);
    for (const t of (tags ?? []) as {
      id: string;
      name: string;
      color: string | null;
    }[]) {
      tagNames.set(t.id, { name: t.name, color: t.color });
    }
  }

  const doc = toPortableFlow(
    flow as Parameters<typeof toPortableFlow>[0],
    nodeRows,
    tagNames
  );

  const body = JSON.stringify(doc, null, 2);
  const filename = portableFlowFilename(
    (flow as { name: string }).name ?? 'flow'
  );

  // `?download=1` asks the browser to save rather than render. The plain
  // call returns the same bytes inline so the UI can preview or copy it
  // without a second endpoint.
  const asDownload = new URL(request.url).searchParams.get('download') === '1';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(asDownload
        ? { 'Content-Disposition': `attachment; filename="${filename}"` }
        : {}),
      // A flow definition is account data; never let a shared cache hold it.
      'Cache-Control': 'private, no-store',
    },
  });
}
