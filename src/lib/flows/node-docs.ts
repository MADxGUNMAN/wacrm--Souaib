/**
 * Plain-English reference for every flow node type.
 *
 * ONE source of truth, TWO consumers:
 *   1. The in-app node reference (`/flows/guide`) and the "what does
 *      this node do" help inside the builder inspector.
 *   2. `buildFlowAuthoringPrompt()` in `./ai-prompt.ts`, which turns
 *      this same data into the prompt a user pastes into ChatGPT /
 *      Gemini / Claude so the model can author an importable flow.
 *
 * Why they share a module rather than each holding their own copy: the
 * two must describe the same product. A prompt that promises a field
 * the builder does not have produces a JSON file that fails import,
 * and a reference that omits a Meta cap produces a flow that fails at
 * Activate. Written twice, they drift within a release.
 *
 * Numbers are imported, never retyped — `INTERACTIVE_LIMITS` is the
 * same constant the validator and the send path use, and
 * `VAR_KEY_PATTERN` is the same regex the validator enforces. If a cap
 * changes upstream, the docs and the AI prompt change with it.
 *
 * The prose here is deliberately non-technical: the audience is a
 * business owner writing their first flow, not the engineer who wrote
 * the engine. Field-level accuracy still matters because an LLM reads
 * the same words.
 */

import { INTERACTIVE_LIMITS } from '@/lib/whatsapp/meta-api';
import { VAR_KEY_PATTERN } from './validate';
import type { FlowNodeType } from './types';

/** One configurable field on a node's `config` object. */
export interface NodeDocField {
  /** Exact key inside `config` — what the JSON must use. */
  name: string;
  /** Human-readable type, e.g. `text`, `1–3 buttons`, `"add" | "remove"`. */
  type: string;
  required: boolean;
  /** What it means, in plain English. */
  what: string;
  /** A concrete value an author can copy. */
  example?: string;
  /** True when this field is (or contains) a link to another node. */
  isEdge?: boolean;
}

export interface NodeDoc {
  type: FlowNodeType;
  /** Matches NODE_META[type].label so the UI reads consistently. */
  title: string;
  /** One sentence, richer than the builder's blurb. */
  oneLiner: string;
  /** 2–4 sentences of plain English. */
  whatItDoes: string;
  /** Concrete situations where this is the right node. */
  whenToUse: string[];
  /**
   * Does the run STOP here and wait for the customer? This is the
   * single most misunderstood property of a flow — everything else
   * fires immediately, one node after another, in the same instant.
   */
  waitsForCustomer: boolean;
  /** No outgoing edges — the run finishes here. */
  terminal: boolean;
  /** How the run leaves this node. */
  branching: string;
  fields: NodeDocField[];
  /** Hard limits, mostly WhatsApp's rather than ours. */
  limits: string[];
  /** Mistakes that are easy to make and quiet when made. */
  gotchas: string[];
  example: {
    caption: string;
    /** A real portable node — valid enough to paste into a flow file. */
    node: {
      node_key: string;
      node_type: FlowNodeType;
      config: Record<string, unknown>;
    };
  };
}

const L = INTERACTIVE_LIMITS;

/** The `next_node_key` field, worded the same way everywhere. */
function nextNodeField(what: string): NodeDocField {
  return {
    name: 'next_node_key',
    type: 'node_key',
    required: true,
    what,
    example: 'ask_country',
    isEdge: true,
  };
}

export const NODE_DOCS: Record<FlowNodeType, NodeDoc> = {
  // ----------------------------------------------------------
  // start
  // ----------------------------------------------------------
  start: {
    type: 'start',
    title: 'Start',
    oneLiner: 'The first step. Points at whatever should happen first.',
    whatItDoes:
      'A signpost, not an action. It sends nothing and the customer never sees it. Its only job is to say which node the flow begins with, which keeps the rest of the flow readable when you come back to it in three months.',
    whenToUse: [
      'As the entry node of almost every flow, so there is one obvious place the flow begins.',
      'You can skip it and make any node the entry node instead — Start is a convenience, not a requirement.',
    ],
    waitsForCustomer: false,
    terminal: false,
    branching: 'One way out: whatever `next_node_key` points at.',
    fields: [nextNodeField('The first real step of the flow.')],
    limits: [],
    gotchas: [
      'Having a Start node is not the same as the flow starting there. The flow begins at whichever node is set as the entry node — set Start as the entry node too.',
    ],
    example: {
      caption: 'Start hands straight over to the first message.',
      node: {
        node_key: 'start',
        node_type: 'start',
        config: { next_node_key: 'greet' },
      },
    },
  },

  // ----------------------------------------------------------
  // send_message
  // ----------------------------------------------------------
  send_message: {
    type: 'send_message',
    title: 'Send message',
    oneLiner: 'Sends a plain WhatsApp text message, then carries on.',
    whatItDoes:
      'Sends one text message to the customer and immediately moves to the next node without waiting for a reply. Use it for anything you are telling rather than asking. You can drop saved answers into the text with {{vars.name}}, which is how a closing summary reads back what the customer chose.',
    whenToUse: [
      'A greeting, a confirmation, or a closing "our team will be in touch".',
      'A summary that reads back everything you captured earlier.',
      'Any explanation that does not need an answer.',
    ],
    waitsForCustomer: false,
    terminal: false,
    branching: 'One way out: `next_node_key`.',
    fields: [
      {
        name: 'text',
        type: 'text',
        required: true,
        what: 'The message body. Supports {{vars.something}} placeholders.',
        example: 'Thanks {{vars.name}} — we have everything we need.',
      },
      nextNodeField('The step that runs straight after the message is sent.'),
    ],
    limits: [
      'WhatsApp truncates very long text messages; keep them well under 4096 characters.',
    ],
    gotchas: [
      'This node does not wait. If you follow it immediately with another Send message the customer gets two messages back to back, which is fine, but if you meant to ask something use Send buttons, Send list, or Collect input instead.',
      'A {{vars.x}} placeholder for a variable that was never captured renders as nothing at all — not an error, just a gap in the sentence.',
    ],
    example: {
      caption: 'A closing summary that reads back saved answers.',
      node: {
        node_key: 'summary',
        node_type: 'send_message',
        config: {
          text: 'Requirement received\n\nQuantity: {{vars.quantity}}\nDestination: {{vars.country}}\n\nOur team will come back with pricing.',
          next_node_key: 'to_agent',
        },
      },
    },
  },

  // ----------------------------------------------------------
  // send_buttons
  // ----------------------------------------------------------
  send_buttons: {
    type: 'send_buttons',
    title: 'Send buttons',
    oneLiner: `Asks a question with up to ${L.maxButtons} tappable buttons, and waits for the tap.`,
    whatItDoes: `Sends a message with up to ${L.maxButtons} quick-reply buttons and stops. Nothing else happens until the customer taps one. Each button has its own onward path, so this is how a flow forks based on what the customer wants. Set var_key if you also want to remember which button they tapped.`,
    whenToUse: [
      'A yes/no or two-or-three-way question.',
      'A menu: "Sales", "Support", "Something else".',
      'Any fork where each answer should lead somewhere different.',
    ],
    waitsForCustomer: true,
    terminal: false,
    branching:
      'One way out per button. The button the customer taps decides which `next_node_key` the run follows.',
    fields: [
      {
        name: 'text',
        type: 'text',
        required: true,
        what: 'The question itself. Supports {{vars.x}}.',
        example: 'How can we help today?',
      },
      {
        name: 'buttons',
        type: `array of ${L.maxButtons} max`,
        required: true,
        what: 'Each entry needs reply_id (a stable internal id), title (the label the customer sees) and next_node_key (where that answer leads).',
        example:
          '{ "reply_id": "sales", "title": "Sales", "next_node_key": "to_sales" }',
        isEdge: true,
      },
      {
        name: 'var_key',
        type: 'variable name',
        required: false,
        what: 'Remember the tapped button. The TITLE the customer saw is saved under this name, so you can read it back later with {{vars.<name>}}.',
        example: 'topic',
      },
      {
        name: 'header_text',
        type: 'text',
        required: false,
        what: 'A short bold line above the question.',
        example: 'Foton Mini Van',
      },
      {
        name: 'footer_text',
        type: 'text',
        required: false,
        what: 'A small grey line under the buttons.',
        example: 'Reply anytime',
      },
    ],
    limits: [
      `At most ${L.maxButtons} buttons — this is WhatsApp's limit, not ours. Need more options? Use Send list.`,
      `Button title: ${L.buttonTitleMaxLength} characters max.`,
      `Header and footer: ${L.headerTextMaxLength} and ${L.footerMaxLength} characters.`,
      'Every reply_id must be unique within the node.',
    ],
    gotchas: [
      'Without var_key the run takes the right branch but nothing records WHICH branch — a later summary using {{vars.topic}} comes out empty.',
      'The saved value is the button TITLE, not the reply_id, because these variables exist to be read back to a person.',
      'Button titles are never interpolated. {{vars.x}} inside a title is sent literally.',
      `A variable name must start with a letter or underscore and contain only letters, numbers and underscores (${VAR_KEY_PATTERN.source}). "buyer type" is rejected at save time, because {{vars.buyer type}} would silently render as nothing.`,
    ],
    example: {
      caption: 'A three-way menu that also remembers the choice.',
      node: {
        node_key: 'ask_topic',
        node_type: 'send_buttons',
        config: {
          text: 'How can we help today?',
          var_key: 'topic',
          buttons: [
            { reply_id: 'sales', title: 'Sales', next_node_key: 'to_sales' },
            {
              reply_id: 'support',
              title: 'Support',
              next_node_key: 'to_support',
            },
            {
              reply_id: 'other',
              title: 'Something else',
              next_node_key: 'to_agent',
            },
          ],
        },
      },
    },
  },

  // ----------------------------------------------------------
  // send_list
  // ----------------------------------------------------------
  send_list: {
    type: 'send_list',
    title: 'Send list',
    oneLiner: `Asks a question with up to ${L.maxListRowsTotal} options behind a tap-to-open list, and waits.`,
    whatItDoes: `The same idea as Send buttons, but for questions with more than ${L.maxButtons} answers. The customer sees your question plus one button that opens a scrollable list of rows. Each row has its own onward path, and rows can carry a second line of description. The run stops until a row is tapped.`,
    whenToUse: [
      `Any question with 4 to ${L.maxListRowsTotal} answers — quantity bands, country groups, buyer type, product category.`,
      'Options that benefit from a short explanation under the label.',
    ],
    waitsForCustomer: true,
    terminal: false,
    branching:
      'One way out per row, across all sections. The row tapped decides which `next_node_key` the run follows.',
    fields: [
      {
        name: 'text',
        type: 'text',
        required: true,
        what: 'The question. Supports {{vars.x}}.',
        example: 'How many units are you looking for?',
      },
      {
        name: 'button_label',
        type: 'short text',
        required: true,
        what: 'The label on the button that opens the list. The customer taps this before seeing any option.',
        example: 'Choose quantity',
      },
      {
        name: 'sections',
        type: 'array of sections, each with rows',
        required: true,
        what: 'Each row needs reply_id, title and next_node_key, and may add a description. Sections are just visual grouping — a single unnamed section is normal.',
        example:
          '{ "rows": [ { "reply_id": "q1", "title": "1-5 units", "next_node_key": "ask_country" } ] }',
        isEdge: true,
      },
      {
        name: 'var_key',
        type: 'variable name',
        required: false,
        what: 'Remember the tapped row. Saves the row TITLE under this name.',
        example: 'quantity',
      },
      {
        name: 'header_text',
        type: 'text',
        required: false,
        what: 'A short bold line above the question.',
      },
      {
        name: 'footer_text',
        type: 'text',
        required: false,
        what: 'A small grey line at the bottom.',
      },
    ],
    limits: [
      `At most ${L.maxListRowsTotal} rows in total across every section — WhatsApp's limit.`,
      `Row title: ${L.listRowTitleMaxLength} characters max. This one bites often: "Export / Shipping Details" is 25 characters and gets rejected; "Export/Shipping Details" fits.`,
      `Row description: ${L.listRowDescriptionMaxLength} characters max.`,
      `At most ${L.maxListSections} sections.`,
      'Every reply_id must be unique across the whole node, not just within its section.',
    ],
    gotchas: [
      'Row titles and the button label are never interpolated — only text, header and footer are.',
      'Same as buttons: without var_key nothing records which row was tapped.',
      'A list needs one extra tap compared to buttons. For a two or three option question, buttons are the friendlier choice.',
    ],
    example: {
      caption: 'A quantity question with four bands, remembered for later.',
      node: {
        node_key: 'ask_quantity',
        node_type: 'send_list',
        config: {
          text: 'How many units are you looking for?',
          button_label: 'Choose quantity',
          var_key: 'quantity',
          sections: [
            {
              title: 'Order size',
              rows: [
                {
                  reply_id: 'q_1_5',
                  title: '1-5 units',
                  next_node_key: 'ask_country',
                },
                {
                  reply_id: 'q_6_10',
                  title: '6-10 units',
                  next_node_key: 'ask_country',
                },
                {
                  reply_id: 'q_11_25',
                  title: '11-25 units',
                  next_node_key: 'ask_country',
                },
                {
                  reply_id: 'q_25_plus',
                  title: '25+ units',
                  next_node_key: 'ask_country',
                },
              ],
            },
          ],
        },
      },
    },
  },

  // ----------------------------------------------------------
  // send_media
  // ----------------------------------------------------------
  send_media: {
    type: 'send_media',
    title: 'Send media',
    oneLiner: 'Sends one image, video, or document, then carries on.',
    whatItDoes:
      'Sends a single file with an optional caption and moves straight on without waiting. The file has to be uploaded in the builder first — the node stores the link to it, so there is nothing to attach at send time.',
    whenToUse: [
      'A product photo, spec sheet, price list, or brochure.',
      'A short demo video after the customer asks to see the product.',
    ],
    waitsForCustomer: false,
    terminal: false,
    branching: 'One way out: `next_node_key`.',
    fields: [
      {
        name: 'media_type',
        type: '"image" | "video" | "document"',
        required: true,
        what: 'Which kind of file this is. WhatsApp renders each differently.',
        example: 'image',
      },
      {
        name: 'media_url',
        type: 'URL',
        required: true,
        what: 'Public link to the file. Filled in for you when you upload through the builder.',
      },
      {
        name: 'caption',
        type: 'text',
        required: false,
        what: 'Text shown under the file. Supports {{vars.x}}.',
        example: 'Here is the spec sheet for the Mini Van.',
      },
      {
        name: 'filename',
        type: 'text',
        required: false,
        what: 'The name the customer sees. Documents only — WhatsApp ignores it for images and video.',
        example: 'foton-mini-van-specs.pdf',
      },
      nextNodeField('The step after the file is sent.'),
    ],
    limits: [
      'Uploads are capped at 16 MB.',
      `Caption: ${L.bodyMaxLength} characters max.`,
    ],
    gotchas: [
      'An AI cannot fill in media_url for you — it has no file to upload. Leave it empty, then upload the file in the builder before activating.',
      'A flow will not activate while a Send media node has no file.',
    ],
    example: {
      caption: 'A spec sheet with a caption. The URL is filled in on upload.',
      node: {
        node_key: 'send_specs',
        node_type: 'send_media',
        config: {
          media_type: 'document',
          media_url: '',
          filename: 'foton-mini-van-specs.pdf',
          caption: 'Full specifications, {{vars.name}}.',
          next_node_key: 'to_agent',
        },
      },
    },
  },

  // ----------------------------------------------------------
  // collect_input
  // ----------------------------------------------------------
  collect_input: {
    type: 'collect_input',
    title: 'Collect input',
    oneLiner: 'Asks an open question and saves whatever the customer types.',
    whatItDoes:
      "Sends your question, waits, then stores the customer's typed reply under a name you choose so later steps can use it. This is the node for anything you cannot offer as a fixed list: a name, a company, a city, a delivery address.",
    whenToUse: [
      'Name, company name, email, address, or any free text.',
      'A question with too many possible answers to list.',
    ],
    waitsForCustomer: true,
    terminal: false,
    branching: 'One way out: `next_node_key`, whatever they answered.',
    fields: [
      {
        name: 'prompt_text',
        type: 'text',
        required: true,
        what: 'The question sent to the customer. Supports {{vars.x}}.',
        example: 'Please share your name and company name.',
      },
      {
        name: 'var_key',
        type: 'variable name',
        required: true,
        what: 'The name the answer is saved under. Read it back later with {{vars.<name>}}.',
        example: 'name',
      },
      {
        name: 'extraction_prompt',
        type: 'text',
        required: false,
        what: 'An instruction for AI to clean up the reply before saving. Without it the raw text is stored exactly as typed.',
        example: "Extract only the person's full name",
      },
      nextNodeField('The step after the answer is saved.'),
    ],
    limits: [
      `The variable name must match ${VAR_KEY_PATTERN.source} — a letter or underscore first, then letters, numbers, underscores.`,
    ],
    gotchas: [
      'Name a variable exactly `name`, `email` or `company` and the contact record is filled in automatically when the flow reaches a Handoff. This is worth doing — it is how a lead becomes a usable contact.',
      'Any non-empty reply is accepted. There is no format checking yet, so a Collect input asking for an email will happily store "later".',
      'A tapped button or list row does not count as a typed reply here — if the customer is mid-Collect-input, use words.',
    ],
    example: {
      caption: 'Capturing a name straight onto the contact record.',
      node: {
        node_key: 'ask_name',
        node_type: 'collect_input',
        config: {
          prompt_text: 'Please share your name and company name.',
          var_key: 'name',
          extraction_prompt: "Extract only the person's full name",
          next_node_key: 'summary',
        },
      },
    },
  },

  // ----------------------------------------------------------
  // condition
  // ----------------------------------------------------------
  condition: {
    type: 'condition',
    title: 'If / else',
    oneLiner: 'Splits the flow in two based on a rule. Sends nothing.',
    whatItDoes:
      'Checks one thing — a saved answer, a contact field, or a tag — and sends the run down one of two paths. The customer sees nothing and nothing waits; the check happens instantly and the flow keeps going.',
    whenToUse: [
      'Treat a returning customer differently from a new one.',
      'Route on an earlier answer: bulk buyers to one path, single buyers to another.',
      'Skip a question you already know the answer to.',
    ],
    waitsForCustomer: false,
    terminal: false,
    branching:
      'Exactly two ways out: `true_next` when the rule holds, `false_next` when it does not. Both are required — there is no "do nothing" branch.',
    fields: [
      {
        name: 'subject',
        type: '"var" | "tag" | "contact_field"',
        required: true,
        what: 'What to look at: a saved answer (var), a tag on the contact (tag), or a field on the contact record (contact_field).',
        example: 'var',
      },
      {
        name: 'subject_key',
        type: 'text',
        required: true,
        what: "Which one. For var, the variable name. For contact_field, one of name, email, phone, company. For tag, the tag's internal id.",
        example: 'quantity',
      },
      {
        name: 'operator',
        type: '"equals" | "contains" | "present" | "absent"',
        required: true,
        what: 'How to compare. present and absent just check whether there is a value at all and ignore `value`.',
        example: 'contains',
      },
      {
        name: 'value',
        type: 'text',
        required: false,
        what: 'What to compare against. Needed for equals and contains.',
        example: '25+',
      },
      {
        name: 'true_next',
        type: 'node_key',
        required: true,
        what: 'Where to go when the rule holds.',
        example: 'bulk_path',
        isEdge: true,
      },
      {
        name: 'false_next',
        type: 'node_key',
        required: true,
        what: 'Where to go when it does not.',
        example: 'standard_path',
        isEdge: true,
      },
    ],
    limits: [
      'Only these four comparisons. There is no greater-than, no less-than, no date maths.',
    ],
    gotchas: [
      "Checking a tag needs the tag's internal id, which you can only pick in the builder. If you are writing the JSON by hand or with an AI, branch on a saved answer instead and add tag checks afterwards.",
      'equals is exact. A list row titled "25+ units" does not equal "25+" — use contains, or compare against the exact title.',
      'Comparing against an empty value matches only empty subjects, which is almost never what you meant.',
    ],
    example: {
      caption: 'Bulk enquiries take a different path.',
      node: {
        node_key: 'is_bulk',
        node_type: 'condition',
        config: {
          subject: 'var',
          subject_key: 'quantity',
          operator: 'contains',
          value: '25+',
          true_next: 'bulk_pricing',
          false_next: 'standard_pricing',
        },
      },
    },
  },

  // ----------------------------------------------------------
  // set_tag
  // ----------------------------------------------------------
  set_tag: {
    type: 'set_tag',
    title: 'Tag contact',
    oneLiner: 'Labels the contact so you can find them later. Sends nothing.',
    whatItDoes:
      'Adds or removes one tag on the contact and moves on immediately. Tags are how a flow turns a conversation into a segment you can broadcast to later — "asked about bulk pricing", "wants export shipping".',
    whenToUse: [
      'Mark what the customer was interested in, at the moment they say it.',
      'Build a list you will send a follow-up campaign to next week.',
      'Remove a tag once a lead converts.',
    ],
    waitsForCustomer: false,
    terminal: false,
    branching: 'One way out: `next_node_key`.',
    fields: [
      {
        name: 'mode',
        type: '"add" | "remove"',
        required: true,
        what: 'Whether to attach the tag or take it off.',
        example: 'add',
      },
      {
        name: 'tag_id',
        type: 'internal id',
        required: true,
        what: 'Which tag. Picked from your existing tags in the builder.',
      },
      {
        name: 'tag_name',
        type: 'text',
        required: false,
        what: 'Import-only shortcut. Name the tag instead of using an id and the import matches it to an existing tag, or creates it. This is how a hand-written or AI-written flow references tags.',
        example: 'Bulk enquiry',
      },
      nextNodeField('The step after the tag is written.'),
    ],
    limits: [],
    gotchas: [
      'A failed tag write does not stop the flow. That is deliberate — the conversation matters more than the label — but it does mean a broken tag reference tags nobody, quietly.',
      'When writing JSON by hand, use tag_name rather than tag_id. An id from another account points at nothing here.',
    ],
    example: {
      caption: 'Tagging by name so import can resolve or create it.',
      node: {
        node_key: 'tag_bulk',
        node_type: 'set_tag',
        config: {
          mode: 'add',
          tag_name: 'Bulk enquiry',
          next_node_key: 'ask_country',
        },
      },
    },
  },

  // ----------------------------------------------------------
  // handoff
  // ----------------------------------------------------------
  handoff: {
    type: 'handoff',
    title: 'Handoff to agent',
    oneLiner:
      'Ends the automation and puts the conversation in front of a human.',
    whatItDoes:
      'Stops the flow and marks the conversation as needing a person, so it surfaces in the inbox as pending. It also copies any answers saved as `name`, `email` or `company` onto the contact record, so your team opens a conversation with a real name attached rather than a phone number.',
    whenToUse: [
      'The end of a qualification flow, once you have what you need.',
      'Any point where the customer asks for something the flow cannot answer.',
      'As the safety net on an "I need help" branch.',
    ],
    waitsForCustomer: false,
    terminal: true,
    branching: 'None. The run finishes here.',
    fields: [
      {
        name: 'note',
        type: 'text',
        required: false,
        what: 'An internal note for the agent picking this up. Never shown to the customer. Supports {{vars.x}}, which is the easy way to hand over a summary.',
        example:
          '{{vars.quantity}} units to {{vars.country}} — bulk pricing needed.',
      },
      {
        name: 'assign_to',
        type: 'agent',
        required: false,
        what: 'Assign the conversation to a specific teammate. Left unset it goes to the shared queue.',
      },
    ],
    limits: [],
    gotchas: [
      'Terminal. Anything you wanted to say to the customer has to be said before this node, not after.',
      'assign_to is removed when a flow is exported — a teammate id from another account would assign the conversation to a stranger.',
      'The contact-record auto-fill only looks for variables named exactly `name`, `email` and `company`. `full_name` is ignored.',
    ],
    example: {
      caption: 'Handing over with the whole enquiry in the note.',
      node: {
        node_key: 'to_agent',
        node_type: 'handoff',
        config: {
          note: 'Bulk enquiry — {{vars.quantity}} to {{vars.country}}, buyer type {{vars.buyer_type}}.',
        },
      },
    },
  },

  // ----------------------------------------------------------
  // ai_agent
  // ----------------------------------------------------------
  ai_agent: {
    type: 'ai_agent',
    title: 'AI Agent',
    oneLiner: 'Lets an AI assistant handle the conversation for a while.',
    whatItDoes:
      'Hands the chat to an AI you brief with a system prompt. Useful where the range of questions is too wide to script — product questions, opening hours, "does it come in blue". When the AI is done, or decides a human is needed, the run continues to the next node.',
    whenToUse: [
      'Open-ended Q&A that a fixed script cannot cover.',
      'A first line of support before escalating to a person.',
    ],
    waitsForCustomer: true,
    terminal: false,
    branching:
      'One way out: `next_node_key`, followed when the AI finishes or escalates. Point it at a Handoff or an End.',
    fields: [
      {
        name: 'system_prompt',
        type: 'text',
        required: true,
        what: 'The briefing: who the assistant is, what it may say, and when it should give up and fetch a human. Be specific about what it must NOT promise.',
        example:
          'You are a sales assistant for Source Vehicle. Answer questions about the Foton Mini Van. Never quote a price — hand off instead.',
      },
      {
        name: 'prompt_text',
        type: 'text',
        required: false,
        what: 'An opening message sent as the customer arrives at this node. Supports {{vars.x}}.',
        example: 'Ask me anything about the Mini Van.',
      },
      nextNodeField('Where to go when the AI is finished — usually a Handoff.'),
    ],
    limits: [
      'Needs AI to be configured for the account. Without it the node cannot answer.',
    ],
    gotchas: [
      'An AI Agent will improvise. If there is anything it must never say — prices, delivery dates, stock — say so in the system prompt explicitly.',
      'Always give it somewhere to go. A flow that ends inside an AI conversation leaves the customer talking to nobody.',
    ],
    example: {
      caption: 'A tightly-scoped assistant that escalates rather than guesses.',
      node: {
        node_key: 'ai_help',
        node_type: 'ai_agent',
        config: {
          prompt_text: 'Ask me anything about the Mini Van.',
          system_prompt:
            'You are a sales assistant for Source Vehicle. Answer questions about the Foton Mini Van only. Never quote prices or delivery dates — say a colleague will confirm. Keep replies under 3 sentences.',
          next_node_key: 'to_agent',
        },
      },
    },
  },

  // ----------------------------------------------------------
  // end
  // ----------------------------------------------------------
  end: {
    type: 'end',
    title: 'End',
    oneLiner: 'Finishes the flow quietly. No message, no handoff.',
    whatItDoes:
      "Marks the run complete. The customer is not told anything and nothing lands in anyone's queue. Use it when the conversation genuinely is finished; use Handoff instead when someone should follow up.",
    whenToUse: [
      'After a final "thanks, we will be in touch" message.',
      'On a branch where the customer opted out and no follow-up is wanted.',
    ],
    waitsForCustomer: false,
    terminal: true,
    branching: 'None. The run finishes here.',
    fields: [],
    limits: [],
    gotchas: [
      'End is silent. If the customer should hear something, send it before this node.',
      'Ending a qualification flow with End rather than Handoff means a warm lead sits in the inbox marked as handled. That is usually a mistake.',
    ],
    example: {
      caption: 'A bare terminal node — there is nothing to configure.',
      node: { node_key: 'done', node_type: 'end', config: {} },
    },
  },
};

/**
 * Things the flow engine genuinely cannot do.
 *
 * Kept as data next to the node docs because it is the other half of
 * the same question. Every entry pairs the limitation with what to do
 * instead, so both the guide and the AI prompt can tell a user "no,
 * and here is the nearest thing that works" rather than just "no".
 */
export const FLOW_LIMITATIONS: { cannot: string; instead: string }[] = [
  {
    cannot:
      'Start a conversation. A flow only ever runs in reply to an inbound message.',
    instead:
      'Send an approved template through Broadcasts. Give it a quick-reply button, then use a keyword flow whose keyword matches the button label to pick the conversation up.',
  },
  {
    cannot: 'Send one of your approved WhatsApp templates from inside a flow.',
    instead:
      'Flows send free-form messages, which is allowed because the customer just wrote to you. Templates are for Broadcasts.',
  },
  {
    cannot: 'Wait. There is no delay, no "follow up in 2 days", no scheduling.',
    instead:
      'Tag the contact, then send a scheduled Broadcast to that tag later.',
  },
  {
    cannot:
      'Call an external API, read a webhook, or look anything up outside this CRM.',
    instead:
      'Collect what you need into variables and hand off to a person, or use the public API from your own system.',
  },
  {
    cannot: 'Do arithmetic, compare numbers, or work with dates.',
    instead:
      'Ask in bands — "1-5", "6-10", "25+" — and branch on the band with contains.',
  },
  {
    cannot: `Offer more than ${L.maxButtons} buttons, or more than ${L.maxListRowsTotal} list rows, in one message.`,
    instead:
      'Split the question across two steps: a broad category first, then the detail.',
  },
  {
    cannot: 'Loop through a list, or repeat a step an unknown number of times.',
    instead:
      'A node can point back to an earlier node, but a run stops after 64 steps as a safety cut-off, so keep repeats short and deliberate.',
  },
  {
    cannot: 'Take a payment, or verify one.',
    instead: 'Hand off to a person, or send a payment link as plain text.',
  },
  {
    cannot:
      'Check a format. A Collect input asking for an email accepts anything.',
    instead:
      'Ask an AI Agent to sanity-check the answer, or use extraction_prompt to clean it up.',
  },
  {
    cannot: 'Split traffic randomly for an A/B test.',
    instead:
      'Build two flows and point two different campaign buttons at them.',
  },
  {
    cannot: 'Attach a file that has not been uploaded here first.',
    instead:
      'Add the Send media node, then upload the file in the builder before activating.',
  },
];

/** Ordered list used by both the reference UI and the prompt. */
export const NODE_DOC_ORDER: FlowNodeType[] = [
  'start',
  'send_message',
  'send_buttons',
  'send_list',
  'send_media',
  'collect_input',
  'condition',
  'set_tag',
  'handoff',
  'ai_agent',
  'end',
];
