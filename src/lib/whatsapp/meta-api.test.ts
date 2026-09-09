import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERACTIVE_LIMITS,
  sendInteractiveButtons,
  sendInteractiveList,
  markMessageRead,
  sendTypingIndicator,
  sendContactsMessage,
  sendLocationMessage,
  sendLocationRequestMessage,
  sendStickerMessage,
} from "./meta-api";

// All assertions in this file run BEFORE the network call. We stub fetch
// to a never-resolving mock so a test that accidentally falls through to
// the request body would hang (and fail) rather than silently hit
// graph.facebook.com.
const neverFetch = () =>
  new Promise<Response>(() => {
    /* intentionally never resolves */
  });

const BASE_ARGS = {
  phoneNumberId: "test-phone",
  accessToken: "test-token",
  to: "1234567890",
  bodyText: "Body text",
} as const;

describe("sendInteractiveButtons — validation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(neverFetch));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an empty buttons array", async () => {
    await expect(
      sendInteractiveButtons({ ...BASE_ARGS, buttons: [] }),
    ).rejects.toThrow(/1-3 buttons/);
  });

  it(`rejects more than ${INTERACTIVE_LIMITS.maxButtons} buttons (Meta cap)`, async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        buttons: [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
          { id: "c", title: "C" },
          { id: "d", title: "D" },
        ],
      }),
    ).rejects.toThrow(/1-3 buttons/);
  });

  it("rejects a button title longer than 20 chars (Meta cap)", async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        buttons: [
          { id: "a", title: "x".repeat(INTERACTIVE_LIMITS.buttonTitleMaxLength + 1) },
        ],
      }),
    ).rejects.toThrow(/exceeds 20 chars/);
  });

  it("rejects a button missing its id", async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        buttons: [{ id: "", title: "Choose me" }],
      }),
    ).rejects.toThrow(/missing id/);
  });

  it("rejects an empty body text", async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        bodyText: "",
        buttons: [{ id: "a", title: "A" }],
      }),
    ).rejects.toThrow(/requires bodyText/);
  });

  it("rejects a header text over the limit", async () => {
    await expect(
      sendInteractiveButtons({
        ...BASE_ARGS,
        headerText: "x".repeat(INTERACTIVE_LIMITS.headerTextMaxLength + 1),
        buttons: [{ id: "a", title: "A" }],
      }),
    ).rejects.toThrow(/headerText exceeds/);
  });

  it("sends the right payload shape when all inputs are valid", async () => {
    let captured: { url: string; body: unknown; method: string } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        captured = {
          url,
          method: init.method ?? "GET",
          body: JSON.parse(String(init.body)),
        };
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.PASS" }] }),
          { status: 200 },
        );
      }),
    );

    const result = await sendInteractiveButtons({
      ...BASE_ARGS,
      headerText: "Hello",
      footerText: "Tap one",
      buttons: [
        { id: "yes", title: "Yes" },
        { id: "no", title: "No" },
      ],
    });

    expect(result).toEqual({ messageId: "wamid.PASS" });
    expect(captured).not.toBeNull();
    expect(captured!.method).toBe("POST");
    expect(captured!.url).toContain("test-phone/messages");
    expect(captured!.body).toMatchObject({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "1234567890",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Body text" },
        header: { type: "text", text: "Hello" },
        footer: { text: "Tap one" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "yes", title: "Yes" } },
            { type: "reply", reply: { id: "no", title: "No" } },
          ],
        },
      },
    });
  });
});

describe("sendInteractiveList — validation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(neverFetch));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ROW = { id: "r1", title: "Row 1" };

  it("rejects zero sections", async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: "Open",
        sections: [],
      }),
    ).rejects.toThrow(/1-10 sections/);
  });

  it(`rejects more than ${INTERACTIVE_LIMITS.maxListRowsTotal} rows total across sections (Meta cap)`, async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `r${i}`,
      title: `Row ${i}`,
    }));
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: "Open",
        sections: [{ rows }],
      }),
    ).rejects.toThrow(/1-10 rows total/);
  });

  it("rejects a row title longer than 24 chars (Meta cap)", async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: "Open",
        sections: [
          {
            rows: [
              {
                id: "r1",
                title: "x".repeat(INTERACTIVE_LIMITS.listRowTitleMaxLength + 1),
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/exceeds 24 chars/);
  });

  it("rejects duplicate row ids across sections", async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: "Open",
        sections: [
          { rows: [{ id: "dupe", title: "First" }] },
          { rows: [{ id: "dupe", title: "Second" }] },
        ],
      }),
    ).rejects.toThrow(/duplicate row id/);
  });

  it("rejects an empty buttonLabel", async () => {
    await expect(
      sendInteractiveList({
        ...BASE_ARGS,
        buttonLabel: "",
        sections: [{ rows: [ROW] }],
      }),
    ).rejects.toThrow(/requires a buttonLabel/);
  });

  it("sends the right payload shape when valid", async () => {
    let captured: { body: unknown } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        captured = { body: JSON.parse(String(init.body)) };
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.LIST" }] }),
          { status: 200 },
        );
      }),
    );

    const result = await sendInteractiveList({
      ...BASE_ARGS,
      buttonLabel: "Open menu",
      sections: [
        {
          title: "Orders",
          rows: [
            { id: "order_1", title: "Order #1", description: "€12" },
            { id: "order_2", title: "Order #2" },
          ],
        },
      ],
    });

    expect(result).toEqual({ messageId: "wamid.LIST" });
    expect(captured).not.toBeNull();
    expect(captured!.body).toMatchObject({
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "Body text" },
        action: {
          button: "Open menu",
          sections: [
            {
              title: "Orders",
              rows: [
                { id: "order_1", title: "Order #1", description: "€12" },
                { id: "order_2", title: "Order #2" },
              ],
            },
          ],
        },
      },
    });
  });
});

describe("markMessageRead (Parity Plan Phase 1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends status: read with correct wamid to Meta", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;
    let capturedHeaders: HeadersInit | undefined = undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init.body));
        capturedHeaders = init.headers;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }),
    );

    const result = await markMessageRead({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      messageId: "wamid.HBgLM...",
    });

    expect(result).toEqual({ success: true });
    expect(capturedUrl).toContain("/phone_123/messages");
    expect(capturedBody).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.HBgLM...",
    });
    expect((capturedHeaders as unknown as Record<string, string>)?.Authorization).toBe("Bearer token_abc");
  });

  it("gracefully swallows Meta error 131009 (message >30 days old) without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: "Message is older than 30 days and cannot be marked as read",
              type: "OAuthException",
              code: 131009,
              fbtrace_id: "trace_xyz",
            },
          }),
          { status: 400 },
        );
      }),
    );

    const result = await markMessageRead({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      messageId: "wamid.OLD",
    });

    expect(result).toEqual({ success: false, ignored: true });
  });

  it("throws MetaApiError on other unexpected failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: "Invalid OAuth access token",
              type: "OAuthException",
              code: 190,
            },
          }),
          { status: 401 },
        );
      }),
    );

    await expect(
      markMessageRead({
        phoneNumberId: "phone_123",
        accessToken: "invalid_token",
        messageId: "wamid.123",
      }),
    ).rejects.toThrow();
  });
});

describe("sendTypingIndicator (Parity Plan Phase 1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends status: read + typing_indicator text payload", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }),
    );

    const result = await sendTypingIndicator({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      messageId: "wamid.HBgLM...",
    });

    expect(result).toEqual({ success: true });
    expect(capturedUrl).toContain("/phone_123/messages");
    expect(capturedBody).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.HBgLM...",
      typing_indicator: {
        type: "text",
      },
    });
  });

  it("gracefully swallows error 131009 without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: "Message cannot be marked as read",
              code: 131009,
            },
          }),
          { status: 400 },
        );
      }),
    );

    const result = await sendTypingIndicator({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      messageId: "wamid.OLD",
    });

    expect(result).toEqual({ success: false, ignored: true });
  });
});

describe("sendContactsMessage (Parity Plan Phase 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects empty contacts array", async () => {
    await expect(
      sendContactsMessage({
        phoneNumberId: "phone_123",
        accessToken: "token_abc",
        to: "1234567890",
        contacts: [],
      }),
    ).rejects.toThrow(/contacts array is required/);
  });

  it("rejects contact with missing formatted_name", async () => {
    await expect(
      sendContactsMessage({
        phoneNumberId: "phone_123",
        accessToken: "token_abc",
        to: "1234567890",
        contacts: [
          {
            name: { formatted_name: "   " },
          },
        ],
      }),
    ).rejects.toThrow(/Each contact must have name.formatted_name/);
  });

  it("sends correct contacts payload structure including wa_id to Meta", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.CONTACT_MSG_1" }] }),
          { status: 200 },
        );
      }),
    );

    const result = await sendContactsMessage({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      to: "1234567890",
      contacts: [
        {
          name: {
            formatted_name: "Barbara J. Johnson",
            first_name: "Barbara",
            last_name: "Johnson",
          },
          phones: [
            {
              phone: "+16505559999",
              type: "Mobile",
              wa_id: "16505559999",
            },
          ],
          org: { company: "Lucky Shrub" },
          emails: [{ email: "barbara@luckyshrub.com", type: "Work" }],
        },
      ],
      contextMessageId: "wamid.REPLY_TO",
    });

    expect(result).toEqual({ messageId: "wamid.CONTACT_MSG_1" });
    expect(capturedUrl).toContain("/phone_123/messages");
    expect(capturedBody).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "1234567890",
      type: "contacts",
      contacts: [
        {
          name: {
            formatted_name: "Barbara J. Johnson",
            first_name: "Barbara",
            last_name: "Johnson",
          },
          phones: [
            {
              phone: "+16505559999",
              type: "Mobile",
              wa_id: "16505559999",
            },
          ],
          org: { company: "Lucky Shrub" },
          emails: [{ email: "barbara@luckyshrub.com", type: "Work" }],
        },
      ],
      context: {
        message_id: "wamid.REPLY_TO",
      },
    });
  });
});

describe("sendLocationMessage (Parity Plan Phase 2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects latitude out of range", async () => {
    await expect(
      sendLocationMessage({
        phoneNumberId: "phone_123",
        accessToken: "token_abc",
        to: "1234567890",
        latitude: 95.5,
        longitude: -122.16,
      }),
    ).rejects.toThrow(/Invalid latitude/);
  });

  it("rejects longitude out of range", async () => {
    await expect(
      sendLocationMessage({
        phoneNumberId: "phone_123",
        accessToken: "token_abc",
        to: "1234567890",
        latitude: 37.44,
        longitude: 195.0,
      }),
    ).rejects.toThrow(/Invalid longitude/);
  });

  it("sends correct location payload to Meta API", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.LOC_MSG_1" }] }),
          { status: 200 },
        );
      }),
    );

    const result = await sendLocationMessage({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      to: "1234567890",
      latitude: 37.4421,
      longitude: -122.1615,
      name: "Philz Coffee",
      address: "101 Forest Ave, Palo Alto",
      contextMessageId: "wamid.PARENT_1",
    });

    expect(result).toEqual({ messageId: "wamid.LOC_MSG_1" });
    expect(capturedUrl).toContain("/phone_123/messages");
    expect(capturedBody).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "1234567890",
      type: "location",
      location: {
        latitude: "37.4421",
        longitude: "-122.1615",
        name: "Philz Coffee",
        address: "101 Forest Ave, Palo Alto",
      },
      context: {
        message_id: "wamid.PARENT_1",
      },
    });
  });
});

describe("sendLocationRequestMessage (Parity Plan Phase 2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects empty bodyText", async () => {
    await expect(
      sendLocationRequestMessage({
        phoneNumberId: "phone_123",
        accessToken: "token_abc",
        to: "1234567890",
        bodyText: "   ",
      }),
    ).rejects.toThrow(/bodyText is required/);
  });

  it("sends correct location_request_message interactive payload", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.LOC_REQ_1" }] }),
          { status: 200 },
        );
      }),
    );

    const result = await sendLocationRequestMessage({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      to: "1234567890",
      bodyText: "Where should we deliver your order?",
      contextMessageId: "wamid.PARENT_2",
    });

    expect(result).toEqual({ messageId: "wamid.LOC_REQ_1" });
    expect(capturedUrl).toContain("/phone_123/messages");
    expect(capturedBody).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "1234567890",
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: {
          text: "Where should we deliver your order?",
        },
        action: {
          name: "send_location",
        },
      },
      context: {
        message_id: "wamid.PARENT_2",
      },
    });
  });
});

describe("sendStickerMessage (Parity Plan Phase 5)", () => {
  it("rejects when both link and mediaId are missing", async () => {
    await expect(
      sendStickerMessage({
        phoneNumberId: "phone_123",
        accessToken: "token_abc",
        to: "1234567890",
      })
    ).rejects.toThrow(/requires either a link or mediaId/);
  });

  it("sends correct sticker payload with public WebP link", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.STICKER_1" }] }),
          { status: 200 }
        );
      })
    );

    const result = await sendStickerMessage({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      to: "1234567890",
      link: "https://example.com/sticker.webp",
      contextMessageId: "wamid.REPLY_TO",
    });

    expect(result).toEqual({ messageId: "wamid.STICKER_1" });
    expect(capturedUrl).toContain("/phone_123/messages");
    expect(capturedBody).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "1234567890",
      type: "sticker",
      sticker: {
        link: "https://example.com/sticker.webp",
      },
      context: {
        message_id: "wamid.REPLY_TO",
      },
    });
  });

  it("sends correct sticker payload with Meta mediaId", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.STICKER_2" }] }),
          { status: 200 }
        );
      })
    );

    const result = await sendStickerMessage({
      phoneNumberId: "phone_123",
      accessToken: "token_abc",
      to: "1234567890",
      mediaId: "meta_media_999",
    });

    expect(result).toEqual({ messageId: "wamid.STICKER_2" });
    expect(capturedBody).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "1234567890",
      type: "sticker",
      sticker: {
        id: "meta_media_999",
      },
    });
  });
});


