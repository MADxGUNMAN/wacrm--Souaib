/**
 * Read a completed Meta WhatsApp Flow submission.
 *
 * When a customer finishes the form opened by a template's FLOW button,
 * Meta delivers an inbound message of type `interactive` with an
 * `nfm_reply`:
 *
 *   interactive: {
 *     type: 'nfm_reply',
 *     nfm_reply: {
 *       name: 'flow',
 *       body: 'Sent',
 *       response_json: '{"flow_token":"abc","screen_0_Name_0":"Aisha"}'
 *     }
 *   }
 *
 * Two things about that shape cause the answers to be lost if you are not
 * expecting them:
 *
 *   - `response_json` is a STRING containing JSON, not an object.
 *   - The keys are generated from the Flow JSON's screen and component
 *     names, e.g. `screen_0_Your_name_0`, so they are readable only after
 *     stripping the positional prefix and suffix.
 *
 * This module turns that into a line of text per answer, which is what the
 * inbox bubble shows. It does NOT invent a schema: an unrecognised key is
 * printed as-is rather than dropped, because a mangled label is recoverable
 * and a missing answer is not.
 *
 * Pure and dependency-free so the webhook can use it and tests can cover
 * the odd real-world payloads without a request.
 */

export interface FlowResponseFields {
  /** The token we generated at send time. Empty when Meta omits it. */
  flowToken: string;
  /** label → value, in the order Meta listed them. */
  answers: { label: string; value: string }[];
  /** A readable rendering for the message bubble. */
  text: string;
}

/**
 * Strip Meta's generated prefix/suffix from a Flow response key.
 *
 * `screen_0_Your_name_0` → `Your name`. Leaves anything that does not
 * match the pattern untouched — the goal is legibility, not enforcement.
 */
export function humaniseFlowFieldName(key: string): string {
  let out = key.replace(/^screen_\d+_/, '');
  // Trailing component index, e.g. `_0` on `Your_name_0`.
  out = out.replace(/_\d+$/, '');
  out = out.replace(/_/g, ' ').trim();
  // Stripping can leave nothing meaningful behind — `screen_0_0` reduces
  // to "0", which labels an answer worse than the raw key does. Fall back
  // whenever no letter survived.
  if (!/[a-z]/i.test(out)) return key;
  return out;
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => stringifyValue(v)).filter(Boolean).join(', ');
  }
  // An object answer (a nested screen's data). Rendered as JSON rather
  // than "[object Object]", which tells the operator nothing.
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function parseFlowResponse(nfmReply: {
  response_json?: string;
  body?: string;
  name?: string;
}): FlowResponseFields {
  const empty: FlowResponseFields = {
    flowToken: '',
    answers: [],
    // Meta's own `body` is usually just "Sent", so it is a poor fallback,
    // but it beats a blank bubble when response_json is missing.
    text: nfmReply.body?.trim() || 'Form submitted',
  };

  if (!nfmReply.response_json?.trim()) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(nfmReply.response_json);
  } catch {
    // Malformed JSON from Meta, or a payload shape that changed. Keep the
    // raw string so nothing the customer typed is lost.
    return { ...empty, text: nfmReply.response_json };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return empty;
  }

  const record = parsed as Record<string, unknown>;
  const flowToken =
    typeof record.flow_token === 'string' ? record.flow_token : '';

  const answers: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(record)) {
    // flow_token is our own correlation id, not something the customer
    // answered, so it is reported separately rather than as a field.
    if (key === 'flow_token') continue;
    const text = stringifyValue(value);
    if (!text) continue;
    answers.push({ label: humaniseFlowFieldName(key), value: text });
  }

  if (answers.length === 0) {
    return { ...empty, flowToken };
  }

  return {
    flowToken,
    answers,
    text: answers.map((a) => `${a.label}: ${a.value}`).join('\n'),
  };
}
