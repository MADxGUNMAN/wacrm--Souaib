/**
 * Builds the prompt a user copies into ChatGPT / Gemini / Claude so the
 * model can author a flow this CRM can import.
 *
 * The prompt is GENERATED from `NODE_DOCS` rather than written out by
 * hand. That is the whole point of the file: a hand-maintained prompt
 * describing eleven node types, their fields, and Meta's caps would be
 * wrong within one release, and the failure is invisible — the model
 * confidently emits a field that does not exist and the user gets a
 * 422 from import with no idea why. Generating it means the prompt is
 * only ever as stale as the product.
 *
 * Design notes on the prompt itself:
 *
 * - It is written TO the model, about the user. The model is told to
 *   interview the user first rather than guess, because the common
 *   case is a user who pastes the prompt and says "build me a lead
 *   qualification flow" with no further detail.
 *
 * - It insists on ONE fenced ```json block and nothing else inside it.
 *   Users copy-paste from chat windows; prose mixed into the block is
 *   the single most likely reason an otherwise-correct answer fails to
 *   import.
 *
 * - It carries an explicit "cannot do" list (`FLOW_LIMITATIONS`) and
 *   requires the model to refuse clearly instead of inventing a node
 *   type. A model asked for a 2-day follow-up will otherwise happily
 *   emit `{"node_type": "delay"}`, which imports as a hard error and
 *   reads to the user like our bug.
 *
 * - It ends with a self-check the model must run before answering. The
 *   checks mirror the real import blockers in `portable.ts`, so a
 *   model that follows them produces a file that imports first time.
 */

import {
  NODE_DOCS,
  NODE_DOC_ORDER,
  FLOW_LIMITATIONS,
  type NodeDoc,
} from './node-docs';
import { PORTABLE_FLOW_VERSION } from './portable';
import { INTERACTIVE_LIMITS } from '@/lib/whatsapp/meta-api';
import { VAR_KEY_PATTERN } from './validate';

const L = INTERACTIVE_LIMITS;

/**
 * Render one node type as a prompt section.
 *
 * The heading carries BOTH names on purpose: the model has to emit the
 * exact `node_type` string, but the user will talk about "Send buttons".
 */
function nodeSection(doc: NodeDoc): string {
  const lines: string[] = [];

  lines.push(`### \`${doc.type}\` — ${doc.title}`);
  lines.push(doc.whatItDoes);
  lines.push('');

  const behaviour: string[] = [];
  behaviour.push(
    doc.waitsForCustomer
      ? 'WAITS for the customer to reply before continuing'
      : 'does NOT wait — the flow continues immediately'
  );
  if (doc.terminal) behaviour.push('TERMINAL — the run ends here');
  lines.push(`Behaviour: ${behaviour.join('; ')}.`);
  lines.push(`Exits: ${doc.branching}`);
  lines.push('');

  lines.push('Config fields:');
  if (doc.fields.length === 0) {
    lines.push('- none. `config` is an empty object `{}`.');
  } else {
    for (const f of doc.fields) {
      const req = f.required ? 'REQUIRED' : 'optional';
      const edge = f.isEdge ? ' [points to another node]' : '';
      lines.push(`- \`${f.name}\` (${f.type}, ${req})${edge} — ${f.what}`);
    }
  }

  if (doc.limits.length > 0) {
    lines.push('');
    lines.push('Limits:');
    for (const lim of doc.limits) lines.push(`- ${lim}`);
  }

  if (doc.gotchas.length > 0) {
    lines.push('');
    lines.push('Watch out:');
    for (const g of doc.gotchas) lines.push(`- ${g}`);
  }

  lines.push('');
  lines.push(`Example — ${doc.example.caption.replace(/\.$/, '')}:`);
  lines.push('```json');
  lines.push(JSON.stringify(doc.example.node, null, 2));
  lines.push('```');

  return lines.join('\n');
}

/**
 * A complete, valid flow used as the worked example in the prompt.
 *
 * Built as a real object and serialised rather than pasted in as a
 * string so that a change to the envelope shape cannot leave a
 * subtly-wrong example behind. Every node here obeys the same rules
 * the prompt asks the model to follow.
 */
export const EXAMPLE_FLOW_DOCUMENT = {
  replai_flow_version: PORTABLE_FLOW_VERSION,
  flow: {
    name: 'Bulk enquiry qualification',
    description: 'Qualifies bulk buyers, then hands over to sales.',
    trigger_type: 'keyword',
    trigger_config: {
      keywords: ['Get Bulk Price', 'bulk price'],
      match_type: 'contains',
      case_sensitive: false,
    },
    entry_node_id: 'start',
    fallback_policy: {},
  },
  nodes: [
    {
      node_key: 'start',
      node_type: 'start',
      config: { next_node_key: 'ask_quantity' },
    },
    {
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
                reply_id: 'q_6_25',
                title: '6-25 units',
                next_node_key: 'ask_country',
              },
              {
                reply_id: 'q_25_plus',
                title: '25+ units',
                next_node_key: 'tag_bulk',
              },
            ],
          },
        ],
      },
    },
    {
      node_key: 'tag_bulk',
      node_type: 'set_tag',
      config: {
        mode: 'add',
        tag_name: 'Bulk enquiry',
        next_node_key: 'ask_country',
      },
    },
    {
      node_key: 'ask_country',
      node_type: 'collect_input',
      config: {
        prompt_text: 'Which country will you import to?',
        var_key: 'country',
        next_node_key: 'ask_name',
      },
    },
    {
      node_key: 'ask_name',
      node_type: 'collect_input',
      config: {
        prompt_text: 'Please share your name and company name.',
        var_key: 'name',
        extraction_prompt: "Extract only the person's full name",
        next_node_key: 'summary',
      },
    },
    {
      node_key: 'summary',
      node_type: 'send_message',
      config: {
        text: 'Thanks {{vars.name}} — requirement received.\n\nQuantity: {{vars.quantity}}\nDestination: {{vars.country}}\n\nOur team will confirm inventory and pricing shortly.',
        next_node_key: 'to_agent',
      },
    },
    {
      node_key: 'to_agent',
      node_type: 'handoff',
      config: {
        note: 'Bulk enquiry — {{vars.quantity}} to {{vars.country}}.',
      },
    },
  ],
};

/**
 * The full prompt.
 *
 * Returned as one string so the UI can drop it straight into a
 * textarea, the clipboard, and a downloadable .txt without three
 * different formatters.
 */
export function buildFlowAuthoringPrompt(): string {
  const nodeCatalogue = NODE_DOC_ORDER.map((type) =>
    nodeSection(NODE_DOCS[type])
  ).join('\n\n');

  const limitations = FLOW_LIMITATIONS.map(
    (l) => `- **${l.cannot}**\n  Instead: ${l.instead}`
  ).join('\n');

  return `# You are a WhatsApp flow builder for Replai

Replai is a WhatsApp CRM. It has a visual "Flows" builder — an automated
conversation that runs when a customer messages a business on WhatsApp.

Your job: talk to me about the conversation I want to automate, then
produce a single JSON file that I can import into Replai directly
(Flows → Import). The JSON format and the complete list of available
building blocks are specified below. Follow them exactly.

---

## How to work with me

1. **Ask first, build second.** If I have not told you enough, ask me
   the questions you need answered — what triggers the conversation,
   what I want to find out from the customer, what should happen at the
   end. Ask them all in one go, not one at a time.
2. **Confirm the shape in plain English** before you write any JSON:
   a short numbered outline of the conversation, so I can correct it
   cheaply.
3. **Then output the JSON**, in exactly one \`\`\`json code block, with
   nothing else inside that block. No comments, no \`...\`, no
   placeholder prose — JSON only. I copy that block verbatim.
4. **After the block**, in normal text, list anything I must finish by
   hand (uploading a file, picking a tag) and anything you had to
   guess.

If what I asked for is not possible, say so plainly — see "What Replai
cannot do" below. Do not invent a node type, a field, or a setting to
paper over a gap. A refusal I can act on is worth far more than a JSON
file that fails to import.

---

## How a Replai flow works

A flow is a **trigger** plus a set of **nodes**.

- The **trigger** decides when the flow starts. A flow can only ever
  start in reply to an inbound WhatsApp message from the customer.
- Each **node** is one step: send a message, ask a question, branch,
  tag, hand over to a human.
- **Connections live INSIDE each node's config.** There is no separate
  "edges" array. A node says where to go next with \`next_node_key\`, or
  with \`true_next\` / \`false_next\` (If/else), or with a
  \`next_node_key\` on each individual button or list row.
- Nodes are identified by \`node_key\` — a short, stable, lowercase
  string like \`ask_country\`. Every link must name a \`node_key\` that
  exists in the same file.
- \`entry_node_id\` is a **\`node_key\`**, not an id or a number.

### Waiting vs not waiting

This is the thing most people get wrong. Four node types stop and wait
for the customer: \`send_buttons\`, \`send_list\`, \`collect_input\` and
\`ai_agent\`. Every other node fires instantly and moves straight on, so
three \`send_message\` nodes in a row means three messages arriving at
once.

### Variables

Answers are saved as **variables** and read back with
\`{{vars.NAME}}\`.

- \`collect_input\` always saves the typed reply (\`var_key\` is
  required).
- \`send_buttons\` and \`send_list\` save the tapped option's **title**,
  but only if you set \`var_key\`. If you leave it off, nothing records
  what the customer chose and a later summary comes out blank. Set it
  on every question whose answer you want to repeat back.
- Variable names must match \`${VAR_KEY_PATTERN.source}\` — start with a
  letter or underscore, then letters, numbers, underscores only. No
  spaces, no dashes.
- There are **no built-in variables**. \`{{vars.phone}}\` is empty
  unless a node captured something called \`phone\`.
- Naming a variable exactly \`name\`, \`email\` or \`company\` also fills
  that field on the customer's contact record when the flow reaches a
  \`handoff\`. Prefer those names for those three things.
- Interpolation works in: \`send_message.text\`, \`send_media.caption\`,
  \`collect_input.prompt_text\`, \`ai_agent.prompt_text\`,
  \`handoff.note\`, and the \`text\` / \`header_text\` / \`footer_text\`
  of \`send_buttons\` and \`send_list\`. It does **not** work in button
  titles, list row titles, or \`button_label\`.

---

## The file format

\`\`\`json
{
  "replai_flow_version": ${PORTABLE_FLOW_VERSION},
  "flow": {
    "name": "Short name shown in the flows list",
    "description": "Internal note. Customers never see it. May be null.",
    "trigger_type": "keyword | first_inbound_message | manual",
    "trigger_config": {},
    "entry_node_id": "node_key of the first node",
    "fallback_policy": {}
  },
  "nodes": [
    { "node_key": "start", "node_type": "start", "config": {}, "position_x": 0, "position_y": 0 }
  ]
}
\`\`\`

- \`replai_flow_version\` must be \`${PORTABLE_FLOW_VERSION}\`.
- \`position_x\` / \`position_y\` are optional canvas coordinates. Either
  omit them or lay the flow out top-to-bottom, e.g. x: 0 and y going up
  in steps of 160.
- \`fallback_policy\` can be left as \`{}\` — sensible defaults apply
  (re-prompt twice, then hand off; 24-hour timeout).
- Imported flows always arrive as a **draft**, so nothing goes live
  until I review and activate it.

### Triggers

- \`"trigger_type": "keyword"\` — starts when the customer's message
  matches a keyword.
  \`trigger_config\`: \`{ "keywords": ["..."], "match_type": "contains" | "exact", "case_sensitive": false }\`.
  \`match_type\` defaults to \`contains\` and \`case_sensitive\` to
  \`false\`. **This is also how a flow picks up a tap on a marketing
  template's quick-reply button** — set the keyword to the exact button
  label, e.g. \`"Get Bulk Price"\`.
- \`"trigger_type": "first_inbound_message"\` — starts on a contact's
  very first message ever. \`trigger_config\`: \`{}\`. Use for a
  greeter. Note that button taps deliberately do NOT start these.
- \`"trigger_type": "manual"\` — never starts by itself; an agent runs
  it. \`trigger_config\`: \`{}\`.

---

## Available node types

There are exactly ${NODE_DOC_ORDER.length} node types. Using any other
value for \`node_type\` makes the file un-importable.

${nodeCatalogue}

---

## What Replai cannot do

If I ask for one of these, say so directly and offer the alternative.
Do not emit a node type that does not exist.

${limitations}

---

## Hard rules

Break any of these and the import fails:

1. \`node_type\` must be one of: ${NODE_DOC_ORDER.map((t) => `\`${t}\``).join(', ')}.
2. Every \`node_key\` must be unique, lowercase, and use only letters,
   numbers and underscores.
3. Every link (\`next_node_key\`, \`true_next\`, \`false_next\`, and the
   \`next_node_key\` on each button and each list row) must be non-empty
   and must name a \`node_key\` present in the same file.
4. \`entry_node_id\` must be one of the \`node_key\` values in the file.
5. Every path must eventually reach a \`handoff\` or an \`end\`. Never
   leave a branch dangling.
6. \`condition\` needs BOTH \`true_next\` and \`false_next\`. There is no
   single-branch condition.
7. At most ${L.maxButtons} buttons per \`send_buttons\`; button titles
   ${L.buttonTitleMaxLength} characters or fewer.
8. At most ${L.maxListRowsTotal} rows in total per \`send_list\`; row
   titles ${L.listRowTitleMaxLength} characters or fewer; descriptions
   ${L.listRowDescriptionMaxLength} or fewer.
9. \`reply_id\` values must be unique within their node.
10. For \`set_tag\`, use \`"tag_name": "Some tag"\` — **never** invent a
    \`tag_id\`. Import matches the name to an existing tag or creates
    it. An invented id points at nothing and silently tags nobody.
11. For \`handoff\`, never include \`assign_to\` — you cannot know the
    team member ids.
12. For \`send_media\`, set \`"media_url": ""\` and tell me to upload the
    file in the builder. You have no file to link to.
13. For \`condition\` with \`"subject": "tag"\`, don't. It needs an
    internal tag id you cannot know. Branch on a variable instead and
    tell me to add tag checks by hand if I really need them.
14. Do not add fields that are not listed for that node type.

---

## Before you answer, check your own work

Walk the flow once, node by node, as if you were the customer:

- Does every link land on a node that exists, spelled identically?
- Is there a path from the entry node to every node? (An unreachable
  node is a wasted step.)
- Does every ending reach \`handoff\` or \`end\`?
- Does every question whose answer you repeat back have a \`var_key\`?
- Does every \`{{vars.X}}\` you use refer to an \`X\` that some earlier
  node actually captures?
- Are all button and row titles inside the character limits? Count
  them.
- Is the JSON valid — no trailing commas, no comments, all strings
  quoted?

---

## A complete, valid example

This is a real importable file. Match this shape.

\`\`\`json
${JSON.stringify(EXAMPLE_FLOW_DOCUMENT, null, 2)}
\`\`\`

---

Now: ask me what conversation I want to automate.
`;
}
