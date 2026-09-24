// ============================================================
// The public API (v1) specification — ONE typed source of truth.
//
// Everything developer-facing is derived from this module: the
// reference page, the per-language code samples, and the "copy as AI
// agent prompt" text. Nothing downstream hard-codes an endpoint, a
// scope, or a status code, so the docs cannot drift from each other.
//
// ─── The rule for editing this file ──────────────────────────────
//
// Every entry here is transcribed from the ROUTE HANDLER it describes,
// not from prose. When an endpoint changes, change the handler, then
// change the matching entry — and re-read the handler while you do it.
// The values that are easiest to get wrong (and were verified against
// the code when this was written) are the required scope, the success
// STATUS (201 vs 200 vs 202), and which body fields are genuinely
// optional.
//
// Shared vocabulary is imported rather than re-listed: scopes from
// `@/lib/api-keys/scopes`, webhook events from `@/lib/webhooks/events`,
// pagination bounds from `@/lib/api/v1/pagination`, the per-key budget
// from `@/lib/rate-limit`. If one of those grows an entry, the docs
// pick it up with no edit here.
// ============================================================

import {
  API_SCOPES,
  SCOPE_DESCRIPTIONS,
  type ApiScope,
} from '@/lib/api-keys/scopes';
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_DESCRIPTIONS,
  type WebhookEvent,
} from '@/lib/webhooks/events';
import { DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/api/v1/pagination';
import { RATE_LIMITS } from '@/lib/rate-limit';
import {
  MAX_CONSECUTIVE_FAILURES,
  DELIVERY_TIMEOUT_MS,
} from '@/lib/webhooks/deliver';

// ─────────────────────────── types ───────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** A path segment or query-string parameter. */
export interface ParamSpec {
  name: string;
  type: string;
  required: boolean;
  description: string;
  /** Shown in the reference table and used in generated samples. */
  example?: string;
}

/** One field of a JSON request body. `children` describes an object. */
export interface BodyFieldSpec {
  name: string;
  type: string;
  required: boolean;
  description: string;
  children?: BodyFieldSpec[];
}

/**
 * Do this field's `children` describe ARRAY ITEMS rather than object keys?
 *
 * Decides whether a child renders as `parent[].child` or `parent.child`,
 * and lives here — beside the `type` convention it interprets — because it
 * was previously reimplemented in both the reference table and the agent
 * prompt, and the same defect therefore shipped in both.
 *
 * Matches the type's SUFFIX, not a substring. That distinction is
 * load-bearing: `template.params` is `string[] | object`, where the array
 * member carries no children and the OBJECT member carries all of them. A
 * substring test read that union as an array and documented every child as
 * `template.params[].headerMediaUrl`, telling readers — and any AI given
 * the generated prompt — to send an array of objects, which the endpoint
 * rejects. Confidently wrong documentation is worse than none.
 *
 * Every genuine array-of-objects field in this spec is a bare `object[]`,
 * so a suffix test covers all of them.
 */
export function childrenAreArrayItems(type: string): boolean {
  return type.trim().endsWith('[]');
}

export interface ResponseSpec {
  status: number;
  description: string;
  /** Fully enveloped example — exactly what comes off the wire. */
  example?: unknown;
}

/** A domain error a specific endpoint can return, beyond the shared set. */
export interface EndpointErrorSpec {
  code: string;
  status: number;
  description: string;
}

export interface EndpointSpec {
  /** Stable slug — the URL fragment on the docs page. Never renumber. */
  id: string;
  method: HttpMethod;
  /** Template form, `{id}` for path params. */
  path: string;
  title: string;
  summary: string;
  /** null = any valid key works (only `GET /api/v1/me` today). */
  scope: ApiScope | null;
  pathParams?: ParamSpec[];
  queryParams?: ParamSpec[];
  bodyFields?: BodyFieldSpec[];
  /** Request body for the generated code samples. Omit for GET/DELETE. */
  sampleBody?: Record<string, unknown>;
  /** Concrete values substituted into `path` in generated samples. */
  pathValues?: Record<string, string>;
  /** Query string used in generated samples, e.g. `?limit=25`. */
  sampleQuery?: string;
  responses: ResponseSpec[];
  errors?: EndpointErrorSpec[];
  /** True when the response uses the keyset `meta.next_cursor` envelope. */
  paginated?: boolean;
  notes?: string[];
}

export interface EndpointGroup {
  id: string;
  title: string;
  description: string;
  endpoints: EndpointSpec[];
}

// ────────────────────── global facts ──────────────────────

/** Path prefix every endpoint shares. */
export const API_BASE_PATH = '/api/v1';

/** Placeholder key used in every generated sample. */
export const SAMPLE_API_KEY = 'wacrm_live_YOUR_API_KEY';

/** Prefix real keys carry — lets a reader spot a wrong-looking value. */
export const API_KEY_PREFIX = 'wacrm_live_';

/** Per-key budget, read off the live limiter config. */
export const RATE_LIMIT = {
  limit: RATE_LIMITS.publicApi.limit,
  windowSeconds: RATE_LIMITS.publicApi.windowMs / 1000,
  /** Headers present on a 429 (and only there — see rate-limit.ts). */
  headers: [
    'Retry-After',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
} as const;

export const PAGINATION = {
  defaultLimit: DEFAULT_LIMIT,
  maxLimit: MAX_LIMIT,
} as const;

/**
 * The shared error codes any endpoint can return. Mirrors
 * `ApiErrorCode` in `src/lib/api/v1/respond.ts` — domain codes specific
 * to one endpoint live on that endpoint's `errors` instead.
 */
export const SHARED_ERROR_CODES: EndpointErrorSpec[] = [
  {
    code: 'unauthorized',
    status: 401,
    description:
      'Missing, malformed, unknown, revoked, or expired key. Deliberately the same response for all five so a probe cannot learn whether a key ever existed.',
  },
  {
    code: 'forbidden',
    status: 403,
    description:
      'The key is valid but lacks the scope this endpoint requires. The message names the missing scope; mint a new key to add one (scopes are fixed at creation).',
  },
  {
    code: 'rate_limited',
    status: 429,
    description: `More than ${RATE_LIMITS.publicApi.limit} requests in ${RATE_LIMITS.publicApi.windowMs / 1000}s on one key. Honour Retry-After and retry.`,
  },
  {
    code: 'bad_request',
    status: 400,
    description:
      'Malformed input — a missing required field, a wrong type, or an unparseable id in a query filter. Retrying without changing the request will fail identically.',
  },
  {
    code: 'not_found',
    status: 404,
    description:
      "No such resource in this key's account. Another account's resource returns 404, never 403, so ids cannot be probed across accounts.",
  },
  {
    code: 'internal',
    status: 500,
    description: 'Something broke on our side. Safe to retry with backoff.',
  },
];

// ───────────────────── endpoint groups ─────────────────────

const identityGroup: EndpointGroup = {
  id: 'identity',
  title: 'Identity',
  description:
    'Verify a key and discover what it can do. Start here when wiring up a new integration — a green response proves the whole auth path works before you touch a real resource.',
  endpoints: [
    {
      id: 'get-me',
      method: 'GET',
      path: '/api/v1/me',
      title: 'Whoami',
      summary:
        'Returns the account the key is bound to and the scopes it carries. The only endpoint that requires no scope, so it works with even an empty-scoped key.',
      scope: null,
      responses: [
        {
          status: 200,
          description: 'The key is live.',
          example: {
            data: {
              account: {
                id: '9f1c2d3e-4b5a-6789-0abc-def123456789',
                name: 'Acme Inc',
              },
              key: {
                id: '1a2b3c4d-5e6f-7089-abcd-ef0123456789',
                scopes: ['messages:send', 'contacts:read'],
              },
            },
          },
        },
      ],
      notes: [
        'Use this as a health check. It exercises bearer parsing, key hash lookup, liveness, the rate limiter, and the response envelope in one call.',
      ],
    },
  ],
};

const messagesGroup: EndpointGroup = {
  id: 'messages',
  title: 'Messages',
  description:
    'Send WhatsApp messages and read a conversation history. Sending takes a phone number rather than an internal id, so an external automation never has to look up a conversation first.',
  endpoints: [
    {
      id: 'post-messages',
      method: 'POST',
      path: '/api/v1/messages',
      title: 'Send a message',
      summary:
        'Sends to a phone number, resolving-or-creating the contact and conversation on the way. Outside a 24-hour customer service window WhatsApp only permits `type: "template"`.',
      scope: 'messages:send',
      bodyFields: [
        {
          name: 'to',
          type: 'string',
          required: true,
          description: 'Recipient in E.164 format, e.g. +14155550123.',
        },
        {
          name: 'type',
          type: 'string',
          required: false,
          description:
            'One of text, template, interactive, contacts, location, location_request, sticker, image, video, document, audio. Defaults to text.',
        },
        {
          name: 'text',
          type: 'string',
          required: false,
          description:
            'Body for a text message, or the caption on a media message. Required when type is text. Captions are capped at 1024 characters.',
        },
        {
          name: 'media_url',
          type: 'string',
          required: false,
          description:
            'Publicly reachable URL. Required for image, video, document, audio, and sticker.',
        },
        {
          name: 'filename',
          type: 'string',
          required: false,
          description: 'Filename shown to the recipient for a document.',
        },
        {
          name: 'template',
          type: 'object',
          required: false,
          description: 'Required when type is template.',
          children: [
            {
              name: 'name',
              type: 'string',
              required: true,
              description: 'Approved template name.',
            },
            {
              name: 'language',
              type: 'string',
              required: false,
              description: 'Language code, e.g. en_US.',
            },
            {
              name: 'params',
              type: 'string[] | object',
              required: false,
              description:
                'An ARRAY fills the body variables {{1}}, {{2}}, … in order, and can do nothing else — a template with a media header, a header variable, or a URL button with {{1}} cannot be sent with the array form. Use the OBJECT form for those; its keys are listed below. Everything belongs inside template.params: unrecognised top-level keys in the request body are ignored silently.',
              children: [
                {
                  name: 'body',
                  type: 'string[]',
                  required: false,
                  description:
                    'Values for the body variables {{1}}, {{2}}, … in order.',
                },
                {
                  name: 'namedBody',
                  type: 'object',
                  required: false,
                  description:
                    'Body values for a NAMED-format template, keyed by parameter name instead of position. Mutually exclusive with body — a positional array sent for a named template would deliver the right values under the wrong labels.',
                },
                {
                  name: 'headerText',
                  type: 'string',
                  required: false,
                  description:
                    'Value for a TEXT header that contains {{1}}. Static text headers need nothing here.',
                },
                {
                  name: 'headerMediaUrl',
                  type: 'string',
                  required: false,
                  description:
                    'Publicly reachable https:// link for an IMAGE, VIDEO or DOCUMENT header. Required on every send unless the template carries a default file. This is where a per-order invoice or ticket PDF goes.',
                },
                {
                  name: 'headerMediaId',
                  type: 'string',
                  required: false,
                  description:
                    'Alternative to headerMediaUrl: an id from a prior Meta media upload. Takes precedence when both are given.',
                },
                {
                  name: 'headerLocation',
                  type: 'object',
                  required: false,
                  description:
                    'For a LOCATION header: latitude, longitude, name and address. All four are required — Meta rejects a partial object.',
                },
                {
                  name: 'buttonParams',
                  type: 'object',
                  required: false,
                  description:
                    'Values for URL buttons whose link contains {{1}}, and for COPY_CODE buttons. Keyed by the button\u2019s index in the template, as a string: { "0": "ORD-123" }.',
                },
                {
                  name: 'offerExpiresAtMs',
                  type: 'number',
                  required: false,
                  description:
                    'Required for a limited-time offer template. UNIX timestamp in MILLISECONDS, not seconds. A past value is refused rather than sent as an already-dead offer.',
                },
                {
                  name: 'cards',
                  type: 'object[]',
                  required: false,
                  description:
                    'Per-card values for a carousel, in card order. Each card takes headerMediaUrl or headerMediaId, body, and buttonParams. Only needed for cards whose text or URL button has variables.',
                },
              ],
            },
          ],
        },
        {
          name: 'reply_to_message_id',
          type: 'string',
          required: false,
          description:
            'Quote an earlier message. Must belong to the same conversation.',
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description:
            'Names the contact if this call creates it. Ignored for an existing contact.',
        },
      ],
      sampleBody: {
        to: '+14155550123',
        type: 'text',
        text: 'Your order #A123 has shipped.',
      },
      responses: [
        {
          status: 201,
          description: 'Accepted by Meta and stored.',
          example: {
            data: {
              message_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
              whatsapp_message_id: 'wamid.HBgLMTQxNTU1NTAxMjMVAgARGB...',
              conversation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
              contact_id: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d',
              contact_created: false,
            },
          },
        },
      ],
      errors: [
        {
          code: 'whatsapp_not_configured',
          status: 400,
          description: 'This account has not connected a WhatsApp number yet.',
        },
        {
          code: 'recipient_opted_out',
          status: 409,
          description:
            'A marketing template was addressed to someone who opted out. Transactional templates still go through.',
        },
        {
          code: 'template_malformed',
          status: 500,
          description:
            'The locally stored template row is unusable — run Sync from Meta in Settings.',
        },
        {
          code: 'meta_error',
          status: 502,
          description:
            'The request reached Meta and Meta rejected it. The message text carries Meta\u2019s reason.',
        },
        {
          code: 'db_error',
          status: 500,
          description:
            'Sent to Meta but not saved locally. The recipient got it; our copy is missing.',
        },
      ],
      notes: [
        'The payload is validated BEFORE the contact and conversation are resolved, so a rejected request never leaves an orphan contact behind.',
        'A 502 meta_error means the send genuinely failed at Meta. Do not blind-retry it — read the message first, because most causes (unapproved template, closed window) repeat.',
        'Sending a template with a media header: put the file inside template.params, NOT at the top level of the body. The top-level media_url field is only for a plain media message (type: image/video/document) — it is ignored for type: template. A per-order invoice looks like this: { "to": "+14155550123", "type": "template", "template": { "name": "order_invoice_pdf", "language": "en_US", "params": { "headerMediaUrl": "https://example.com/ORD-5074.pdf", "body": ["Ravi", "ORD-5074"] } } }',
        'template.params as an ARRAY only fills body variables. A template with a media header, a header variable, or a URL button containing {{1}} must use the object form — the array form has nowhere to put those values.',
        'Set language to the template\u2019s APPROVED language code. A template approved as "en" does not send as "en_US", and Meta\u2019s rejection does not name the mismatch.',
        // Referenced as a bare path, not as "METHOD /path": endpoint
        // headings use that form, and a focused single-endpoint agent brief
        // asserts that no OTHER endpoint heading appears in it.
        'Unsure what a template needs? The single-campaign endpoint (/api/v1/campaigns/{id}) returns a template block giving the body variable count, whether a media header is required, and which buttons take values — build your form from that instead of guessing.',
      ],
    },
    {
      id: 'get-conversation-messages',
      method: 'GET',
      path: '/api/v1/conversations/{id}/messages',
      title: 'List messages in a conversation',
      summary:
        'Newest first, keyset-paginated. Ownership of the conversation is checked before any message is returned.',
      scope: 'messages:read',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Conversation id.',
          example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        },
      ],
      pathValues: { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      queryParams: [
        {
          name: 'limit',
          type: 'integer',
          required: false,
          description: `1–${MAX_LIMIT}, default ${DEFAULT_LIMIT}.`,
        },
        {
          name: 'cursor',
          type: 'string',
          required: false,
          description: 'Opaque cursor from a previous meta.next_cursor.',
        },
      ],
      paginated: true,
      responses: [
        {
          status: 200,
          description: 'A page of messages.',
          example: {
            data: [
              {
                id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
                conversation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                direction: 'inbound',
                sender_type: 'customer',
                content_type: 'text',
                content_text: 'Where is my order?',
                media_url: null,
                template_name: null,
                whatsapp_message_id: 'wamid.HBgLMTQxNTU1NTAxMjMVAgARGB...',
                status: 'read',
                reply_to_message_id: null,
                interactive_reply_id: null,
                created_at: '2026-09-18T09:12:04.512Z',
              },
            ],
            meta: { next_cursor: null },
          },
        },
        {
          status: 404,
          description:
            'Unknown conversation, or one belonging to another account.',
        },
      ],
      notes: [
        'direction is derived: sender_type "customer" is inbound, anything else is outbound.',
      ],
    },
  ],
};

const contactsGroup: EndpointGroup = {
  id: 'contacts',
  title: 'Contacts',
  description:
    'Read, create, and update contacts. Creation is find-or-create by phone number, using the same de-duplication as the inbound webhook — so calling it twice cannot produce two rows for one person.',
  endpoints: [
    {
      id: 'get-contacts',
      method: 'GET',
      path: '/api/v1/contacts',
      title: 'List contacts',
      summary:
        'Newest first, keyset-paginated, with optional search and tag filters.',
      scope: 'contacts:read',
      queryParams: [
        {
          name: 'limit',
          type: 'integer',
          required: false,
          description: `1–${MAX_LIMIT}, default ${DEFAULT_LIMIT}.`,
        },
        {
          name: 'cursor',
          type: 'string',
          required: false,
          description: 'Opaque cursor from a previous meta.next_cursor.',
        },
        {
          name: 'search',
          type: 'string',
          required: false,
          description:
            'Case-insensitive substring match on name or phone. Sanitized server-side.',
        },
        {
          name: 'tag',
          type: 'uuid',
          required: false,
          description:
            'Tag id — not a tag name. Returns contacts carrying that tag, each still with its full tag set.',
        },
      ],
      sampleQuery: '?limit=25',
      paginated: true,
      responses: [
        {
          status: 200,
          description: 'A page of contacts.',
          example: {
            data: [
              {
                id: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d',
                phone: '+14155550123',
                name: 'Jane Doe',
                email: 'jane@example.com',
                company: 'Acme Inc',
                avatar_url: null,
                tags: [
                  {
                    id: '2c4e6a80-1b3d-5f70-8a9c-bd0e1f2a3b4c',
                    name: 'VIP',
                    color: '#22c55e',
                  },
                ],
                created_at: '2026-09-01T10:00:00.000Z',
                updated_at: '2026-09-18T09:12:04.512Z',
              },
            ],
            meta: {
              next_cursor: 'MjAyNi0wOS0wMVQxMDowMDowMC4wMDBafGIxYTdj...',
            },
          },
        },
      ],
      errors: [
        {
          code: 'bad_request',
          status: 400,
          description:
            '`tag` was not a valid UUID — a tag NAME is the usual mistake.',
        },
      ],
    },
    {
      id: 'post-contacts',
      method: 'POST',
      path: '/api/v1/contacts',
      title: 'Create a contact',
      summary:
        'Find-or-create by phone. The body is the contact either way; the STATUS tells you which happened — 201 created, 200 already existed.',
      scope: 'contacts:write',
      bodyFields: [
        {
          name: 'phone',
          type: 'string',
          required: true,
          description: 'E.164 format, e.g. +14155550123.',
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Defaults to the phone number when omitted.',
        },
        {
          name: 'email',
          type: 'string',
          required: false,
          description: 'Email address.',
        },
        {
          name: 'company',
          type: 'string',
          required: false,
          description: 'Company name.',
        },
        {
          name: 'tags',
          type: 'string[]',
          required: false,
          description:
            'Tag NAMES (not ids). Matched case-insensitively; unknown names are created.',
        },
      ],
      sampleBody: {
        phone: '+14155550123',
        name: 'Jane Doe',
        email: 'jane@example.com',
        tags: ['VIP'],
      },
      responses: [
        { status: 201, description: 'A new contact was created.' },
        {
          status: 200,
          description:
            'An existing contact matched this phone number and was returned unchanged.',
        },
      ],
      errors: [
        {
          code: 'bad_request',
          status: 400,
          description: '`phone` is missing, or not valid E.164.',
        },
      ],
      notes: [
        'Branch on the status code, not the body — there is no `created` field.',
        'An existing contact keeps the source it was first seen with; only a contact this call creates is labelled as API-originated.',
      ],
    },
    {
      id: 'get-contact',
      method: 'GET',
      path: '/api/v1/contacts/{id}',
      title: 'Read a contact',
      summary: 'One contact with its tags.',
      scope: 'contacts:read',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Contact id.',
          example: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d',
        },
      ],
      pathValues: { id: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d' },
      responses: [
        { status: 200, description: 'The contact.' },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s contact.',
        },
      ],
    },
    {
      id: 'patch-contact',
      method: 'PATCH',
      path: '/api/v1/contacts/{id}',
      title: 'Update a contact',
      summary:
        'Only the fields present in the body change. Send null to clear one; omit it to leave it alone.',
      scope: 'contacts:write',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Contact id.',
          example: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d',
        },
      ],
      pathValues: { id: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d' },
      bodyFields: [
        {
          name: 'name',
          type: 'string | null',
          required: false,
          description: 'Any other type is a 400 rather than a silent no-op.',
        },
        {
          name: 'email',
          type: 'string | null',
          required: false,
          description: 'Email address.',
        },
        {
          name: 'company',
          type: 'string | null',
          required: false,
          description: 'Company name.',
        },
        {
          name: 'tags',
          type: 'string[]',
          required: false,
          description:
            'REPLACES the tag set with exactly these names. Pass [] to clear all tags.',
        },
      ],
      sampleBody: { company: 'Acme Inc', tags: ['VIP', 'Renewal'] },
      responses: [
        { status: 200, description: 'The updated contact.' },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s contact.',
        },
      ],
      notes: [
        '`tags` is a replace, not a merge — read the contact first if you mean to add one.',
      ],
    },
  ],
};

const conversationsGroup: EndpointGroup = {
  id: 'conversations',
  title: 'Conversations',
  description:
    'Browse threads. Each conversation embeds its contact and that contact\u2019s tags, so a list view needs no follow-up calls.',
  endpoints: [
    {
      id: 'get-conversations',
      method: 'GET',
      path: '/api/v1/conversations',
      title: 'List conversations',
      summary: 'Newest first, keyset-paginated.',
      scope: 'conversations:read',
      queryParams: [
        {
          name: 'limit',
          type: 'integer',
          required: false,
          description: `1–${MAX_LIMIT}, default ${DEFAULT_LIMIT}.`,
        },
        {
          name: 'cursor',
          type: 'string',
          required: false,
          description: 'Opaque cursor from a previous meta.next_cursor.',
        },
        {
          name: 'status',
          type: 'string',
          required: false,
          description:
            'open, pending, or closed. An unrecognised value matches nothing and returns an empty page.',
        },
        {
          name: 'contact_id',
          type: 'uuid',
          required: false,
          description: 'Only this contact\u2019s conversations.',
        },
      ],
      sampleQuery: '?status=open&limit=25',
      paginated: true,
      responses: [
        {
          status: 200,
          description: 'A page of conversations.',
          example: {
            data: [
              {
                id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                contact_id: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d',
                status: 'open',
                assigned_agent_id: null,
                last_message_text: 'Where is my order?',
                last_message_at: '2026-09-18T09:12:04.512Z',
                unread_count: 1,
                created_at: '2026-09-01T10:00:00.000Z',
                updated_at: '2026-09-18T09:12:04.512Z',
                contact: {
                  id: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d',
                  phone: '+14155550123',
                  name: 'Jane Doe',
                  email: 'jane@example.com',
                  company: 'Acme Inc',
                  tags: [],
                },
              },
            ],
            meta: { next_cursor: null },
          },
        },
      ],
      errors: [
        {
          code: 'bad_request',
          status: 400,
          description: '`contact_id` was not a valid UUID.',
        },
      ],
    },
    {
      id: 'get-conversation',
      method: 'GET',
      path: '/api/v1/conversations/{id}',
      title: 'Read a conversation',
      summary: 'One conversation with its embedded contact.',
      scope: 'conversations:read',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Conversation id.',
          example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        },
      ],
      pathValues: { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      responses: [
        { status: 200, description: 'The conversation.' },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s conversation.',
        },
      ],
    },
  ],
};

const broadcastsGroup: EndpointGroup = {
  id: 'broadcasts',
  title: 'Broadcasts',
  description:
    'Send one approved template to many recipients in a single call, then poll for progress. Use this for an ad-hoc send; use a Campaign when the same send repeats.',
  endpoints: [
    {
      id: 'post-broadcasts',
      method: 'POST',
      path: '/api/v1/broadcasts',
      title: 'Launch a broadcast',
      summary:
        'Persists the broadcast and its recipients, then fans out to Meta after the response is sent. Returns 202 — the send is under way, not finished.',
      scope: 'broadcasts:send',
      bodyFields: [
        {
          name: 'template_name',
          type: 'string',
          required: true,
          description: 'An approved template.',
        },
        {
          name: 'template_language',
          type: 'string',
          required: false,
          description: 'Language code. Defaults to en_US.',
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Label shown in the dashboard.',
        },
        {
          name: 'recipients',
          type: 'object[]',
          required: true,
          description: '1–1000 entries.',
          children: [
            {
              name: 'to',
              type: 'string',
              required: true,
              description: 'E.164 phone number.',
            },
            {
              name: 'params',
              type: 'string[]',
              required: false,
              description: 'Fills the template body variables in order.',
            },
          ],
        },
      ],
      sampleBody: {
        name: 'September promo',
        template_name: 'promo_september',
        template_language: 'en_US',
        recipients: [
          { to: '+14155550123', params: ['Jane'] },
          { to: '+14155550124', params: ['Ravi'] },
        ],
      },
      responses: [
        {
          status: 202,
          description: 'Accepted; the fan-out is running.',
          example: {
            data: {
              broadcast_id: '8d5f1e2a-3b4c-5d6e-7f80-91a2b3c4d5e6',
              status: 'sending',
              total_recipients: 2,
              accepted: 2,
              rejected: 0,
              suppressed: 0,
            },
          },
        },
      ],
      errors: [
        {
          code: 'bad_request',
          status: 400,
          description:
            'Missing template_name, empty recipients, more than 1000 recipients, or no recipient with a valid E.164 number.',
        },
        {
          code: 'whatsapp_not_configured',
          status: 400,
          description: 'No WhatsApp number connected on this account.',
        },
        {
          code: 'all_recipients_opted_out',
          status: 400,
          description:
            'Every recipient has opted out of marketing from this account.',
        },
        {
          code: 'template_malformed',
          status: 500,
          description:
            'The locally stored template row is unusable — re-sync from Meta.',
        },
      ],
      notes: [
        'rejected counts recipients dropped for an unusable phone number. suppressed counts marketing opt-outs — they get no recipient row, so they appear only in this response and never in the persisted counts.',
        'Capped at 1000 per request. A near-cap audience can exceed the 60-second fan-out budget, so split very large sends across calls.',
      ],
    },
    {
      id: 'get-broadcast',
      method: 'GET',
      path: '/api/v1/broadcasts/{id}',
      title: 'Get broadcast status',
      summary:
        'Poll after launching. status moves sending → sent, while the delivered and read counts keep climbing as Meta webhooks arrive.',
      scope: 'broadcasts:send',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Broadcast id from the launch response.',
          example: '8d5f1e2a-3b4c-5d6e-7f80-91a2b3c4d5e6',
        },
      ],
      pathValues: { id: '8d5f1e2a-3b4c-5d6e-7f80-91a2b3c4d5e6' },
      responses: [
        {
          status: 200,
          description: 'Current counts.',
          example: {
            data: {
              id: '8d5f1e2a-3b4c-5d6e-7f80-91a2b3c4d5e6',
              name: 'September promo',
              template_name: 'promo_september',
              template_language: 'en_US',
              status: 'sent',
              total_recipients: 2,
              sent_count: 2,
              delivered_count: 2,
              read_count: 1,
              replied_count: 0,
              failed_count: 0,
              created_at: '2026-09-18T09:00:00.000Z',
              updated_at: '2026-09-18T09:01:12.004Z',
            },
          },
        },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s broadcast.',
        },
      ],
      notes: [
        'Counts settle as delivery webhooks arrive, so a freshly finished broadcast can still show delivered_count climbing for a while.',
      ],
    },
  ],
};

const campaignsGroup: EndpointGroup = {
  id: 'campaigns',
  title: 'Campaigns',
  description:
    'A campaign is a saved, recipient-less send definition you trigger repeatedly — the right shape for a spreadsheet row or a backend event. Every trigger is idempotent, so a retry cannot double-send.',
  endpoints: [
    {
      id: 'get-campaigns',
      method: 'GET',
      path: '/api/v1/campaigns',
      title: 'List campaigns',
      summary:
        'The smallest shape that populates a picker. What a template NEEDS to send lives on the single-campaign endpoint instead.',
      scope: 'broadcasts:send',
      queryParams: [
        {
          name: 'limit',
          type: 'integer',
          required: false,
          description: `1–${MAX_LIMIT}, default ${DEFAULT_LIMIT}.`,
        },
        {
          name: 'cursor',
          type: 'string',
          required: false,
          description: 'Opaque cursor from a previous meta.next_cursor.',
        },
      ],
      paginated: true,
      responses: [
        {
          status: 200,
          description: 'A page of campaigns.',
          example: {
            data: [
              {
                id: 'c0ffee00-1111-2222-3333-444455556666',
                name: 'Order shipped',
                template_name: 'order_shipped',
                template_language: 'en_US',
                status: 'active',
                created_at: '2026-09-10T08:00:00.000Z',
              },
            ],
            meta: { next_cursor: null },
          },
        },
      ],
    },
    {
      id: 'get-campaign',
      method: 'GET',
      path: '/api/v1/campaigns/{id}',
      title: 'Read a campaign and its send plan',
      summary:
        'Adds a `template` block describing exactly what the template needs — how many body variables, whether a media header is required, which buttons take values. Build your form from this instead of hard-coding it.',
      scope: 'broadcasts:send',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Campaign id.',
          example: 'c0ffee00-1111-2222-3333-444455556666',
        },
      ],
      pathValues: { id: 'c0ffee00-1111-2222-3333-444455556666' },
      responses: [
        {
          status: 200,
          description:
            'The campaign, its send plan, and a template_warning that is null when all is well.',
          example: {
            data: {
              id: 'c0ffee00-1111-2222-3333-444455556666',
              name: 'Order shipped',
              template_name: 'order_shipped',
              template_language: 'en_US',
              status: 'active',
              created_at: '2026-09-10T08:00:00.000Z',
              template: {
                category: 'UTILITY',
                body_variable_count: 2,
                body_variable_names: [],
                parameter_format: 'POSITIONAL',
                header: null,
                needs_header_location: false,
                url_buttons: [],
                copy_code_buttons: [],
                offer: null,
                is_order_status: false,
                is_authentication: false,
                commerce: null,
                cards: [],
                needs_no_input: false,
              },
              template_warning: null,
            },
          },
        },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s campaign.',
        },
      ],
      notes: [
        'A campaign can outlive its template. When that happens `template` is null and `template_warning` explains why — reported plainly rather than as a 500, because the campaign itself is still real.',
      ],
    },
    {
      id: 'post-campaign-send',
      method: 'POST',
      path: '/api/v1/campaigns/{id}/send',
      title: 'Trigger a campaign send',
      summary:
        'Requires a caller-computed idempotency_key. Replaying the same key sends nothing and returns the original broadcast id, so a retry over a flaky connection is always safe.',
      scope: 'broadcasts:send',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Campaign id.',
          example: 'c0ffee00-1111-2222-3333-444455556666',
        },
      ],
      pathValues: { id: 'c0ffee00-1111-2222-3333-444455556666' },
      bodyFields: [
        {
          name: 'idempotency_key',
          type: 'string',
          required: true,
          description:
            'Deterministic key for this logical send, 200 characters or fewer. Derive it from something stable, e.g. a spreadsheet row id plus the values sent.',
        },
        {
          name: 'recipients',
          type: 'object[]',
          required: true,
          description: 'Non-empty.',
          children: [
            {
              name: 'to',
              type: 'string',
              required: true,
              description: 'E.164 phone number.',
            },
            {
              name: 'name',
              type: 'string',
              required: false,
              description: 'Names the contact if this call creates it.',
            },
            {
              name: 'params',
              type: 'string[]',
              required: false,
              description: 'Fills the template body variables in order.',
            },
            {
              name: 'media_url',
              type: 'string',
              required: false,
              description: 'Header media for templates that require it.',
            },
            {
              name: 'button_params',
              type: 'object',
              required: false,
              description:
                'Button index (as a string key) to its value, e.g. {"0":"ORD-123"}.',
            },
          ],
        },
        {
          name: 'param_labels',
          type: 'string[]',
          required: false,
          description:
            'Names each positional value in params so the report reads "Order id: 393392" instead of an unlabelled column. Describes the whole call, not one recipient.',
        },
        {
          name: 'source',
          type: 'object',
          required: false,
          description:
            'Free-form provenance stored on the run, e.g. {"kind":"google_sheets","spreadsheet_id":"…"}. Its `kind` also suffixes the run name so repeat runs are tellable apart.',
        },
      ],
      sampleBody: {
        idempotency_key: 'sheet1-row42-ORD123',
        recipients: [
          { to: '+14155550123', name: 'Jane', params: ['ORD-123', '2 days'] },
        ],
        param_labels: ['Order id', 'Delivery window'],
        source: {
          kind: 'google_sheets',
          spreadsheet_id: '1AbC…',
          sheet: 'Sheet1',
        },
      },
      responses: [
        {
          status: 202,
          description:
            'Accepted. status is "sending" when delivered inline, or "scheduled" when handed to the background sweep.',
          example: {
            data: {
              broadcast_id: '8d5f1e2a-3b4c-5d6e-7f80-91a2b3c4d5e6',
              status: 'sending',
              total_recipients: 1,
              accepted: 1,
              rejected: 0,
              suppressed: 0,
            },
          },
        },
        {
          status: 200,
          description:
            'This idempotency_key was already used. Nothing was sent; broadcast_id points at the original run.',
          example: {
            data: {
              duplicate: true,
              broadcast_id: '8d5f1e2a-3b4c-5d6e-7f80-91a2b3c4d5e6',
            },
          },
        },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s campaign.',
        },
      ],
      errors: [
        {
          code: 'bad_request',
          status: 400,
          description:
            'idempotency_key missing or over 200 characters, or recipients empty.',
        },
        {
          code: 'campaign_paused',
          status: 403,
          description: 'The campaign is paused. Resume it in the dashboard.',
        },
        {
          code: 'subscription_inactive',
          status: 403,
          description: 'This workspace needs an active subscription to send.',
        },
      ],
      notes: [
        'Up to 25 recipients are delivered inline and come back status "sending". More than that is queued and comes back status "scheduled", drained by a sweep that runs every five minutes.',
        'Branch on status 200 vs 202, or on the `duplicate` field, to tell a replay from a fresh send.',
        'The key is only spent once a run is actually created. If creation fails the claim is released, so a corrected retry with the same key genuinely tries again.',
      ],
    },
  ],
};

const webhooksGroup: EndpointGroup = {
  id: 'webhooks',
  title: 'Webhooks',
  description:
    'Register HTTPS endpoints to receive events instead of polling. Each delivery is signed, so you can prove it came from us.',
  endpoints: [
    {
      id: 'get-webhooks',
      method: 'GET',
      path: '/api/v1/webhooks',
      title: 'List webhook endpoints',
      summary:
        'Returns the whole roster — it is settings-class and small, so meta.next_cursor is always null here.',
      scope: 'webhooks:manage',
      responses: [
        {
          status: 200,
          description: 'Every endpoint on the account.',
          example: {
            data: [
              {
                id: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
                url: 'https://example.com/hooks/wacrm',
                events: ['message.received', 'message.status_updated'],
                is_active: true,
                last_delivery_at: '2026-09-18T09:12:05.000Z',
                failure_count: 0,
                created_at: '2026-09-01T10:00:00.000Z',
              },
            ],
            meta: { next_cursor: null },
          },
        },
      ],
    },
    {
      id: 'post-webhooks',
      method: 'POST',
      path: '/api/v1/webhooks',
      title: 'Register a webhook endpoint',
      summary:
        'Returns the signing secret in plaintext exactly once. Store it now — we keep only an encrypted copy and can never show it again.',
      scope: 'webhooks:manage',
      bodyFields: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description:
            'Absolute https:// URL. Plain http is rejected, since it would leak signed payloads.',
        },
        {
          name: 'events',
          type: 'string[]',
          required: true,
          description: `Non-empty list drawn from: ${WEBHOOK_EVENTS.join(', ')}.`,
        },
      ],
      sampleBody: {
        url: 'https://example.com/hooks/wacrm',
        events: ['message.received', 'message.status_updated'],
      },
      responses: [
        {
          status: 201,
          description: 'Created. `secret` appears in this response only.',
          example: {
            data: {
              id: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
              url: 'https://example.com/hooks/wacrm',
              events: ['message.received', 'message.status_updated'],
              is_active: true,
              last_delivery_at: null,
              failure_count: 0,
              created_at: '2026-09-18T09:00:00.000Z',
              secret: 'whsec_XQf3kL9…',
            },
          },
        },
      ],
      errors: [
        {
          code: 'bad_request',
          status: 400,
          description:
            'url is not a valid https URL, or events is empty or has an unknown name.',
        },
      ],
    },
    {
      id: 'get-webhook',
      method: 'GET',
      path: '/api/v1/webhooks/{id}',
      title: 'Read a webhook endpoint',
      summary: 'The secret is never included here.',
      scope: 'webhooks:manage',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Endpoint id.',
          example: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
        },
      ],
      pathValues: { id: 'aa11bb22-cc33-dd44-ee55-ff6677889900' },
      responses: [
        { status: 200, description: 'The endpoint.' },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s endpoint.',
        },
      ],
    },
    {
      id: 'patch-webhook',
      method: 'PATCH',
      path: '/api/v1/webhooks/{id}',
      title: 'Update a webhook endpoint',
      summary:
        'Change the url, the event subscription, or the active flag. Re-enabling also clears the failure streak.',
      scope: 'webhooks:manage',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Endpoint id.',
          example: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
        },
      ],
      pathValues: { id: 'aa11bb22-cc33-dd44-ee55-ff6677889900' },
      bodyFields: [
        {
          name: 'url',
          type: 'string',
          required: false,
          description: 'New https:// URL.',
        },
        {
          name: 'events',
          type: 'string[]',
          required: false,
          description: 'Replaces the subscription. Must be non-empty.',
        },
        {
          name: 'is_active',
          type: 'boolean',
          required: false,
          description:
            'Pause or resume. Setting it true also resets failure_count to 0.',
        },
      ],
      sampleBody: { is_active: true },
      responses: [
        { status: 200, description: 'The updated endpoint.' },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s endpoint.',
        },
      ],
      errors: [
        {
          code: 'bad_request',
          status: 400,
          description:
            'No updatable field was supplied, or one of them was invalid.',
        },
      ],
    },
    {
      id: 'delete-webhook',
      method: 'DELETE',
      path: '/api/v1/webhooks/{id}',
      title: 'Delete a webhook endpoint',
      summary: 'Permanent. Deliveries stop immediately.',
      scope: 'webhooks:manage',
      pathParams: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          description: 'Endpoint id.',
          example: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
        },
      ],
      pathValues: { id: 'aa11bb22-cc33-dd44-ee55-ff6677889900' },
      responses: [
        {
          status: 200,
          description: 'Deleted.',
          example: {
            data: { id: 'aa11bb22-cc33-dd44-ee55-ff6677889900', deleted: true },
          },
        },
        {
          status: 404,
          description: 'Unknown id, or another account\u2019s endpoint.',
        },
      ],
    },
  ],
};

export const API_GROUPS: EndpointGroup[] = [
  identityGroup,
  messagesGroup,
  contactsGroup,
  conversationsGroup,
  broadcastsGroup,
  campaignsGroup,
  webhooksGroup,
];

// ─────────────────────── webhook delivery ───────────────────────

/**
 * How a delivery arrives and how to verify it. Values are read from
 * `@/lib/webhooks/deliver` so the documented timeout and auto-disable
 * threshold cannot drift from the deliverer.
 */
export const WEBHOOK_DELIVERY = {
  signatureHeader: 'X-Wacrm-Signature',
  eventHeader: 'X-Wacrm-Event',
  idHeader: 'X-Wacrm-Webhook-Id',
  /** `t=<unix_seconds>,v1=<hex HMAC-SHA256>` over `${t}.${rawBody}`. */
  signatureFormat: 't=<unix_seconds>,v1=<hex HMAC-SHA256>',
  signedPayload: '${timestamp}.${rawRequestBody}',
  algorithm: 'HMAC-SHA256',
  recommendedToleranceSeconds: 300,
  timeoutMs: DELIVERY_TIMEOUT_MS,
  maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
  /** Example of the JSON envelope every event shares. */
  examplePayload: {
    id: 'd3b07384-d9a0-4f9b-8b2e-1c5a6f7e8d90',
    event: 'message.received',
    occurred_at: '2026-09-18T09:12:04.512Z',
    account_id: '9f1c2d3e-4b5a-6789-0abc-def123456789',
    data: {
      conversation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      contact_id: 'b1a7c3d2-8e4f-4a5b-9c6d-7e8f9a0b1c2d',
    },
  },
  notes: [
    'Verify against the RAW request body, before any JSON parse — a re-serialized copy will not match the HMAC.',
    'Compare in constant time, and reject a timestamp outside your tolerance window to block replays.',
    'Delivery is a single attempt with no retry. Respond 2xx quickly and do your real work asynchronously.',
    `Each consecutive failure increments failure_count; at ${MAX_CONSECUTIVE_FAILURES} the endpoint is auto-disabled so a dead sink stops being hit. Any success resets the counter.`,
    'Redirects are not followed, and endpoints resolving to private or loopback addresses are refused. Both count as failures.',
    'Deduplicate on the payload `id` — it is unique per delivery.',
  ],
} as const;

export interface WebhookEventSpec {
  name: WebhookEvent;
  description: string;
}

export const WEBHOOK_EVENT_SPECS: WebhookEventSpec[] = WEBHOOK_EVENTS.map(
  (name) => ({ name, description: WEBHOOK_EVENT_DESCRIPTIONS[name] })
);

// ────────────────────────── scopes ──────────────────────────

export interface ScopeSpec {
  name: ApiScope;
  description: string;
  /** Endpoint ids this scope unlocks — derived, never hand-listed. */
  endpointIds: string[];
}

// ───────────────────── derived lookups ─────────────────────

/** Every endpoint, flattened, in the order the page renders them. */
export const ALL_ENDPOINTS: EndpointSpec[] = API_GROUPS.flatMap(
  (g) => g.endpoints
);

export const SCOPE_SPECS: ScopeSpec[] = API_SCOPES.map((name) => ({
  name,
  description: SCOPE_DESCRIPTIONS[name],
  endpointIds: ALL_ENDPOINTS.filter((e) => e.scope === name).map((e) => e.id),
}));

/** Look up one endpoint by its stable slug. */
export function findEndpoint(id: string): EndpointSpec | undefined {
  return ALL_ENDPOINTS.find((e) => e.id === id);
}

/** `GET /api/v1/contacts` — the label used in headings and samples. */
export function endpointLabel(endpoint: EndpointSpec): string {
  return `${endpoint.method} ${endpoint.path}`;
}

/**
 * Substitute concrete ids into a templated path so a sample is
 * copy-runnable. Any param without a `pathValues` entry falls back to
 * its documented `example`, then to the bare placeholder.
 */
export function resolvePath(endpoint: EndpointSpec): string {
  let path = endpoint.path;
  for (const param of endpoint.pathParams ?? []) {
    const value =
      endpoint.pathValues?.[param.name] ?? param.example ?? `{${param.name}}`;
    path = path.replace(`{${param.name}}`, value);
  }
  return path;
}
